import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createPool, createStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';

if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must point to a disposable test database');
const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL });
const token = 'integration-test-only-32-character-token';
const log = { info() {}, error() {} };
const app = createApp({ store: createStore(pool), adminToken: token, logger: log });
const auth = { Authorization: `Bearer ${token}` };
before(async () => {
  await migrate(pool);
  await migrate(pool);
});
after(async () => {
  await pool.end();
});
test('anonymous reads, protected writes and full shipment lifecycle', async () => {
  await request(app).get('/healthz').expect(200);
  await request(app).get('/readyz').expect(200);
  await request(app).get('/api/shipments').expect(401);
  await request(app).post('/api/shipments').send({}).expect(401);
  await request(app)
    .post('/api/shipments')
    .set(auth)
    .send({ origin: 'Berlin', destination: 'X', service: 'express' })
    .expect(400);
  const created = await request(app)
    .post('/api/shipments')
    .set(auth)
    .send({
      origin: 'Berlin',
      destination: 'Munich',
      service: 'express',
      reference: 'private customer ref',
    })
    .expect(201);
  const id = created.body.trackingNumber;
  assert.equal(created.body.reference, undefined);
  assert.equal(created.body.events.length, 1);
  await request(app)
    .post(`/api/shipments/${id}/events`)
    .set(auth)
    .send({ status: 'delivered', location: 'Munich', expectedVersion: 1 })
    .expect(409);
  for (const [i, status] of [
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
  ].entries()) {
    const response = await request(app)
      .post(`/api/shipments/${id}/events`)
      .set(auth)
      .send({ status, location: 'Munich', expectedVersion: i + 1 })
      .expect(201);
    assert.equal(response.body.events.length, i + 2);
  }
  await request(app)
    .post(`/api/shipments/${id}/events`)
    .set(auth)
    .send({ status: 'in_transit', location: 'Munich', expectedVersion: 5 })
    .expect(409);
  const tracked = await request(app).get(`/api/shipments/${id}`).expect(200);
  assert.equal(tracked.body.status, 'delivered');
  assert.equal(tracked.body.reference, undefined);
  const listed = await request(app).get('/api/shipments').set(auth).expect(200);
  assert.ok(
    listed.body.shipments.some(
      (s) => s.trackingNumber === id && s.reference === 'private customer ref',
    ),
  );
});
test('concurrent writers cannot overwrite status or duplicate events', async () => {
  const { body } = await request(app)
    .post('/api/shipments')
    .set(auth)
    .send({ origin: 'Bonn', destination: 'Essen', service: 'standard' });
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(app)
        .post(`/api/shipments/${body.trackingNumber}/events`)
        .set(auth)
        .send({ status: 'picked_up', location: 'Bonn', expectedVersion: 1 }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const tracked = await request(app).get(`/api/shipments/${body.trackingNumber}`);
  assert.equal(tracked.body.version, 2);
  assert.equal(tracked.body.events.length, 2);
});
test('malformed input, missing shipments and oversized payloads are handled', async () => {
  await request(app).get('/api/shipments/not-valid').expect(400);
  await request(app).get('/api/shipments/PF-0000000000000000').expect(404);
  await request(app)
    .post('/api/shipments')
    .set(auth)
    .send({ origin: 'x'.repeat(10000) })
    .expect(413);
  await request(app)
    .post('/api/shipments')
    .set(auth)
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
});
test('readiness fails when the database is unavailable; liveness remains healthy', async () => {
  const offline = createApp({
    store: {
      ready: async () => {
        throw new Error('offline');
      },
    },
    adminToken: token,
    logger: log,
  });
  await request(offline).get('/readyz').expect(503);
  await request(offline).get('/healthz').expect(200);
});
test('request throttling returns 429 after the limit', async () => {
  const limited = createApp({
    store: { list: async () => [] },
    adminToken: token,
    logger: log,
    rateLimitMax: 2,
  });
  await request(limited).get('/api/shipments').set(auth).expect(200);
  await request(limited).get('/api/shipments').set(auth).expect(200);
  await request(limited).get('/api/shipments').set(auth).expect(429);
});
