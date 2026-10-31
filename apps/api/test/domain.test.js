import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  shipmentInput,
  eventInput,
  newTrackingNumber,
  trackingPattern,
  tokenMatches,
} from '../src/domain.js';
test('delivery cannot be skipped or changed after completion', () => {
  assert.equal(canTransition('created', 'delivered'), false);
  assert.equal(canTransition('delivered', 'in_transit'), false);
  assert.equal(canTransition('delayed', 'in_transit'), true);
  assert.equal(canTransition('in_transit', 'out_for_delivery'), true);
});
test('shipment input rejects extra fields, markup and oversize values', () => {
  const valid = { origin: 'Berlin', destination: 'München', service: 'express' };
  assert.equal(shipmentInput.parse(valid).reference, '');
  for (const invalid of [
    { ...valid, status: 'delivered' },
    { ...valid, origin: '<script>' },
    { ...valid, destination: 'x'.repeat(81) },
  ])
    assert.equal(shipmentInput.safeParse(invalid).success, false);
});
test('updates require an integer concurrency version', () => {
  assert.equal(eventInput.safeParse({ status: 'picked_up', location: 'Berlin' }).success, false);
  assert.equal(
    eventInput.safeParse({ status: 'picked_up', location: 'Berlin', expectedVersion: 0 }).success,
    false,
  );
});
test('tracking numbers are random, well formed and tokens fail closed', () => {
  const numbers = Array.from({ length: 1000 }, newTrackingNumber);
  assert.equal(new Set(numbers).size, 1000);
  assert.ok(numbers.every((n) => trackingPattern.test(n)));
  assert.equal(tokenMatches(undefined, 'secret'), false);
  assert.equal(tokenMatches('wrong', 'secret'), false);
  assert.equal(tokenMatches('secret', 'secret'), true);
});
