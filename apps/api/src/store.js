import { Pool } from 'pg';
import { canTransition, newTrackingNumber, HttpError } from './domain.js';

export function createPool(config) {
  return new Pool({
    ...config,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    application_name: 'parcelflow',
  });
}
const shipmentColumns =
  'tracking_number AS "trackingNumber", origin, destination, service, status, version, created_at AS "createdAt", updated_at AS "updatedAt"';
export function createStore(pool) {
  return {
    async ready() {
      await pool.query('SELECT 1');
    },
    async list() {
      const { rows } = await pool.query(
        `SELECT ${shipmentColumns}, reference FROM shipments ORDER BY created_at DESC, tracking_number LIMIT 100`,
      );
      return rows;
    },
    async get(trackingNumber) {
      // One SQL statement gives a consistent snapshot of the status and event history.
      const { rows } = await pool.query(
        `SELECT ${shipmentColumns},
        COALESCE((SELECT json_agg(json_build_object('status',e.status,'location',e.location,'createdAt',e.created_at,'version',e.version) ORDER BY e.version)
        FROM shipment_events e WHERE e.tracking_number=s.tracking_number), '[]'::json) AS events
        FROM shipments s WHERE tracking_number=$1`,
        [trackingNumber],
      );
      if (!rows[0]) throw new HttpError(404, 'Shipment not found');
      return rows[0];
    },
    async create(input) {
      const db = await pool.connect();
      const trackingNumber = newTrackingNumber();
      try {
        await db.query('BEGIN');
        await db.query(
          'INSERT INTO shipments (tracking_number,origin,destination,service,reference) VALUES ($1,$2,$3,$4,$5)',
          [trackingNumber, input.origin, input.destination, input.service, input.reference],
        );
        await db.query(
          'INSERT INTO shipment_events (tracking_number,status,location,version) VALUES ($1,$2,$3,1)',
          [trackingNumber, 'created', input.origin],
        );
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      } finally {
        db.release();
      }
      return this.get(trackingNumber);
    },
    async addEvent(trackingNumber, input) {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const { rows } = await db.query(
          'SELECT status,version FROM shipments WHERE tracking_number=$1 FOR UPDATE',
          [trackingNumber],
        );
        if (!rows[0]) throw new HttpError(404, 'Shipment not found');
        if (rows[0].version !== input.expectedVersion)
          throw new HttpError(409, 'Shipment changed. Refresh before updating.');
        if (!canTransition(rows[0].status, input.status))
          throw new HttpError(409, 'Invalid status transition');
        await db.query(
          'UPDATE shipments SET status=$2, version=version+1, updated_at=now() WHERE tracking_number=$1',
          [trackingNumber, input.status],
        );
        await db.query(
          'INSERT INTO shipment_events (tracking_number,status,location,version) VALUES ($1,$2,$3,$4)',
          [trackingNumber, input.status, input.location, input.expectedVersion + 1],
        );
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      } finally {
        db.release();
      }
      return this.get(trackingNumber);
    },
  };
}
