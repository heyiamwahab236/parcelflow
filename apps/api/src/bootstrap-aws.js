// Run only as the dedicated migration service account, never as the API service account.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createPool } from './store.js';
import { migrate } from './migrate.js';

const client = new SecretsManagerClient({});
async function get(id) {
  return JSON.parse((await client.send(new GetSecretValueCommand({ SecretId: id }))).SecretString);
}
async function ensure(id, create) {
  try {
    return await get(id);
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') throw error;
    const value = create();
    await client.send(
      new PutSecretValueCommand({ SecretId: id, SecretString: JSON.stringify(value) }),
    );
    return value;
  }
}
const master = await get(process.env.MASTER_SECRET_ARN);
const app = await ensure(process.env.DB_SECRET_ARN, () => ({
  username: 'parcelflow_app',
  password: randomBytes(36).toString('base64url'),
}));
await ensure(process.env.ADMIN_SECRET_ARN, () => ({
  token: randomBytes(36).toString('base64url'),
}));
if (app.username !== 'parcelflow_app') throw new Error('Unexpected application database role');
const pool = createPool({
  host: process.env.DB_HOST,
  port: 5432,
  database: process.env.DB_NAME || 'parcelflow',
  user: master.username,
  password: master.password,
  ssl: { rejectUnauthorized: true, ca: readFileSync('/app/certs/rds.pem', 'utf8') },
});
try {
  await migrate(pool);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(70801343)');
    const { rows } = await db.query("SELECT 1 FROM pg_roles WHERE rolname='parcelflow_app'");
    const command = rows.length ? 'ALTER' : 'CREATE';
    const formatted = await db.query(
      `SELECT format('${command} ROLE parcelflow_app LOGIN PASSWORD %L', $1::text) AS sql`,
      [app.password],
    );
    await db.query(formatted.rows[0].sql);
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query('GRANT CONNECT ON DATABASE parcelflow TO parcelflow_app');
    await db.query('GRANT USAGE ON SCHEMA public TO parcelflow_app');
    await db.query('GRANT SELECT, INSERT, UPDATE ON shipments TO parcelflow_app');
    await db.query('GRANT SELECT, INSERT ON shipment_events TO parcelflow_app');
    await db.query('GRANT USAGE ON SEQUENCE shipment_events_id_seq TO parcelflow_app');
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
  console.info('Schema and restricted application role ready; secrets were not logged');
} finally {
  await pool.end();
}
