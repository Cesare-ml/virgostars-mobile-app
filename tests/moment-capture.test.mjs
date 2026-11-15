import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMoment } from '../src/app/moment/moment-capture.ts';

const instant = '2026-11-15T12:30:00.000Z';
const ms = Date.parse(instant);
const location = (overrides = {}) => ({
  latitude: 44.534, longitude: 11.623, accuracyMeters: 18, measuredAtMs: ms + 3500, ...overrides
});

test('capture freezes tap time before asynchronous GPS reading', async () => {
  let entered = false;
  const record = await captureMoment(async () => {
    entered = true;
    return location();
  }, 'in-app', () => new Date(instant), () => 'synthetic-uuid');
  assert.equal(entered, true);
  assert.equal(record.id, 'synthetic-uuid');
  assert.equal(record.capturedAtUtc, instant);
  assert.equal(record.positionMeasuredAtUtc, new Date(ms + 3500).toISOString());
  assert.equal(record.latitude, 44.534);
  assert.equal(record.longitude, 11.623);
  assert.equal(record.accuracyMeters, 18);
  assert.ok(typeof record.timezoneId === 'string' && record.timezoneId.length > 0);
  assert.equal(record.utcOffsetMinutes, -new Date(instant).getTimezoneOffset());
  assert.equal(record.calculationStatus, 'not-calculated');
  assert.equal(record.persistence, 'session-only');
});

test('rejects invalid latitude/longitude and accuracy', async () => {
  for (const sample of [
    location({ latitude: 91 }), location({ longitude: -181 }),
    location({ latitude: Number.NaN }), location({ accuracyMeters: -2 }),
    location({ accuracyMeters: Number.POSITIVE_INFINITY })
  ]) {
    await assert.rejects(captureMoment(async () => sample, 'in-app', () => new Date(instant)), /unreliable-position/);
  }
});

test('rejects stale GPS fixes and does not silently substitute an old location', async () => {
  await assert.rejects(
    captureMoment(async () => location({ measuredAtMs: ms - 60_000 }), 'in-app', () => new Date(instant)),
    /unreliable-position/
  );
});

test('no record is returned when location acquisition is denied', async () => {
  await assert.rejects(
    captureMoment(async () => { throw new Error('location-permission-denied'); }, 'in-app', () => new Date(instant)),
    /location-permission-denied/
  );
});

test('invalid device clock is rejected before acquiring GPS', async () => {
  let providerCalled = false;
  await assert.rejects(captureMoment(async () => {
    providerCalled = true;
    return location();
  }, 'in-app', () => new Date(Number.NaN)), /invalid-device-clock/);
  assert.equal(providerCalled, false);
});
