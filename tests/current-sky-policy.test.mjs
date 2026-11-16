import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceMeters,
  isCurrentSkySnapshotFresh,
  isValidCurrentSkyFix,
  shouldRefreshCurrentSky,
  CURRENT_SKY_REFRESH_INTERVAL_MS
} from '../src/app/current-sky/refresh-policy.ts';

const fix = (overrides = {}) => ({
  latitudeDeg: 44.5,
  longitudeDegEast: 11.3,
  accuracyMeters: 12,
  measuredAtMs: 100_000,
  ...overrides
});

test('a fresh foreground location is valid and a stale or invalid one fails closed', () => {
  assert.equal(isValidCurrentSkyFix(fix(), 110_000), true);
  assert.equal(isValidCurrentSkyFix(fix({ measuredAtMs: 1 }), 100_000), false);
  assert.equal(isValidCurrentSkyFix(fix({ latitudeDeg: 91 }), 100_000), false);
  assert.equal(isValidCurrentSkyFix(fix({ accuracyMeters: -1 }), 100_000), false);
  assert.equal(isValidCurrentSkyFix(fix({ measuredAtMs: 110_000 }), 100_000), false);
});

test('the first valid fix triggers a calculation', () => {
  assert.equal(shouldRefreshCurrentSky(null, 100_000, fix()), true);
});

test('periodic refresh uses a one-minute foreground cadence', () => {
  const baseline = { calculatedAtMs: 100_000, latitudeDeg: 44.5, longitudeDegEast: 11.3 };
  assert.equal(shouldRefreshCurrentSky(baseline, 100_000 + CURRENT_SKY_REFRESH_INTERVAL_MS - 1, fix()), false);
  assert.equal(shouldRefreshCurrentSky(baseline, 100_000 + CURRENT_SKY_REFRESH_INTERVAL_MS, fix()), true);
});

test('meaningful location movement triggers a recalculation', () => {
  const baseline = { calculatedAtMs: 100_000, latitudeDeg: 44.5, longitudeDegEast: 11.3 };
  assert.equal(shouldRefreshCurrentSky(baseline, 110_000, fix({ latitudeDeg: 44.5025 })), true);
  assert.equal(shouldRefreshCurrentSky(baseline, 110_000, fix({ latitudeDeg: 44.5001 })), false);
});

test('haversine distance remains finite around the antimeridian', () => {
  assert.ok(Number.isFinite(distanceMeters(0, 179.999, 0, -179.999)));
  assert.ok(distanceMeters(0, 179.999, 0, -179.999) < 300);
});

test('stale or future snapshots are not displayable as the current sky', () => {
  assert.equal(isCurrentSkySnapshotFresh(90_000, 100_000), true);
  assert.equal(isCurrentSkySnapshotFresh(1, 100_000), false);
  assert.equal(isCurrentSkySnapshotFresh(101_000, 100_000), false);
});
