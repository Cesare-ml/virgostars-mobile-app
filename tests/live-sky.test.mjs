import test from 'node:test';
import assert from 'node:assert/strict';
import { readLiveSkySnapshot } from '../src/app/live-sky/live-sky-session.ts';

const instant = '2026-11-16T11:00:00.000Z';
const timestamp = Date.parse(instant);
const location = (overrides = {}) => ({
  latitude: 44.4949,
  longitude: 11.3426,
  accuracyMeters: 18,
  measuredAtMs: timestamp - 2500,
  ...overrides
});

test('uses device time after GPS and preserves the GPS measurement timestamp', async () => {
  const snapshot = await readLiveSkySnapshot(async () => location(), () => new Date(instant));
  assert.equal(snapshot.observedAtUtc, instant);
  assert.equal(snapshot.positionMeasuredAtUtc, new Date(timestamp - 2500).toISOString());
  assert.equal(snapshot.latitude, 44.4949);
  assert.equal(snapshot.longitude, 11.3426);
  assert.equal(snapshot.accuracyMeters, 18);
  assert.ok(snapshot.timezoneId.length > 0);
  assert.equal(typeof snapshot.utcOffsetMinutes, 'number');
});

test('rejects geographic coordinates outside their valid range', async () => {
  for (const sample of [location({ latitude: 91 }), location({ longitude: -181 })]) {
    await assert.rejects(readLiveSkySnapshot(async () => sample, () => new Date(instant)), /unreliable-position/);
  }
});

test('rejects invalid accuracy and stale or future GPS samples', async () => {
  for (const sample of [
    location({ accuracyMeters: -1 }),
    location({ accuracyMeters: Number.POSITIVE_INFINITY }),
    location({ measuredAtMs: timestamp - 46_000 }),
    location({ measuredAtMs: timestamp + 46_000 })
  ]) {
    await assert.rejects(readLiveSkySnapshot(async () => sample, () => new Date(instant)), /unreliable-position/);
  }
});

test('rejects an invalid device clock', async () => {
  await assert.rejects(readLiveSkySnapshot(async () => location(), () => new Date(Number.NaN)), /invalid-device-clock/);
});

test('returns no observation when location acquisition fails', async () => {
  await assert.rejects(
    readLiveSkySnapshot(async () => { throw new Error('location-permission-denied'); }, () => new Date(instant)),
    /location-permission-denied/
  );
});
