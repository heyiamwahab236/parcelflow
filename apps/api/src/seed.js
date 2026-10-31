import { configFromEnv } from './config.js';
import { createPool } from './store.js';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true')
  throw new Error('Set ALLOW_DEMO_SEED=true to load synthetic data');
const { database } = await configFromEnv();
const pool = createPool(database);
const db = await pool.connect();
try {
  await db.query('BEGIN');
  const demos = [
    [
      'PF-A1B2C3D4E5F60708',
      'Berlin',
      'Munich',
      'express',
      ['created', 'picked_up', 'in_transit', 'out_for_delivery'],
    ],
    [
      'PF-B1B2C3D4E5F60708',
      'Hamburg',
      'Cologne',
      'standard',
      ['created', 'picked_up', 'in_transit'],
    ],
    [
      'PF-C1B2C3D4E5F60708',
      'Leipzig',
      'Frankfurt',
      'express',
      ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'],
    ],
    [
      'PF-D1B2C3D4E5F60708',
      'Dresden',
      'Stuttgart',
      'standard',
      ['created', 'picked_up', 'in_transit', 'delayed'],
    ],
  ];
  for (const [id, origin, destination, service, steps] of demos) {
    const result = await db.query(
      `INSERT INTO shipments(tracking_number,origin,destination,service,reference,status,version,created_at)
      VALUES ($1,$2,$3,$4,'SYNTHETIC DEMO',$5,$6,now()-interval '2 days') ON CONFLICT DO NOTHING RETURNING tracking_number`,
      [id, origin, destination, service, steps.at(-1), steps.length],
    );
    if (!result.rowCount) continue;
    for (let i = 0; i < steps.length; i++)
      await db.query(
        `INSERT INTO shipment_events(tracking_number,status,location,version,created_at)
      VALUES ($1,$2,$3,$4,now()-($5 * interval '6 hours'))`,
        [id, steps[i], i < 2 ? origin : destination, i + 1, steps.length - i],
      );
  }
  await db.query('COMMIT');
  console.info('Synthetic demo shipments ready');
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  db.release();
  await pool.end();
}
