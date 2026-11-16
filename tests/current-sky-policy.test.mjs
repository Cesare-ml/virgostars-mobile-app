import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceMeters,
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

test('a fresh foreground location is valid and stale or invalid fixes fail closed', () => {
  assert.equal(isValidCurrentSkyFix(fix(), 110_000), true);
  assert.equal(isValidCurrentSkyFix(fix({ measuredAtMs: 1 }), 100_000), false);
  assert.equal(isValidCurrentSkyFix(fix({ latitudeDeg: 91 }), 100_000), false);
  assert.equal(isValidCurrentSkyFix(fix({ accuracyMeters: -1 }), 100_000), false);
  assert.equal(isValidCurrentSkyFix(fix({ measuredAtMs: 110_000 }), 100_000), false);
});

test('the first valid fix triggers a calculation', () => {
  assert.equal(shouldRefreshCurrentSky(null, 100_000, fix()), true);
});

test('periodic refresh uses a one-minute cadence', () => {
  const baseline = { lastRequestAtMs: 100_000, latitudeDeg: 44.5, longitudeDegEast: 11.3 };
  const justBeforeDue = 100_000 + CURRENT_SKY_REFRESH_INTERVAL_MS - 1;
  const due = 100_000 + CURRENT_SKY_REFRESH_INTERVAL_MS;
  assert.equal(shouldRefreshCurrentSky(baseline, justBeforeDue, fix({ measuredAtMs: justBeforeDue - 1_000 })), false);
  assert.equal(shouldRefreshCurrentSky(baseline, due, fix({ measuredAtMs: due - 1_000 })), true);
});

test('meaningful movement triggers recalculation inside the one-minute interval', () => {
  const baseline = { lastRequestAtMs: 100_000, latitudeDeg: 44.5, longitudeDegEast: 11.3 };
  assert.equal(shouldRefreshCurrentSky(baseline, 110_000, fix({ latitudeDeg: 44.5025, measuredAtMs: 109_000 })), true);
  assert.equal(shouldRefreshCurrentSky(baseline, 110_000, fix({ latitudeDeg: 44.5001, measuredAtMs: 109_000 })), false);
});

test('haversine distance handles longitude wrap at the antimeridian', () => {
  const distance = distanceMeters(0, 179.999, 0, -179.999);
  assert.ok(Number.isFinite(distance));
  assert.ok(distance < 300);
});
