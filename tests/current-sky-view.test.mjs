import test from 'node:test';
import assert from 'node:assert/strict';
import { needsSkyRefresh, layoutPlanetMarkers } from '../src/app/current-sky-view.mjs';

const date = value => new Date(value);

test('refreshes on first launch, stale interval and clock rollback', () => {
  const now = date('2026-11-16T12:00:00.000Z');
  assert.equal(needsSkyRefresh(null, now), true);
  assert.equal(needsSkyRefresh(date('2026-11-16T11:59:59.999Z'), now), false);
  assert.equal(needsSkyRefresh(date('2026-11-16T11:59:00.000Z'), now), true);
  assert.equal(needsSkyRefresh(date('2026-11-16T12:00:01.000Z'), now), true);
  assert.equal(needsSkyRefresh(new Date(NaN), now), true);
});

test('refresh rejects invalid input and interval', () => {
  assert.throws(() => needsSkyRefresh(null, new Date(NaN)), /valid current Date/);
  assert.throws(() => needsSkyRefresh(date('2026-11-16'), date('2026-11-16'), 0), /positive/);
});

test('wheel markers preserve exact longitude on the reference ring', () => {
  const bodies = [{ id: 'sun', longitudeDeg: 0 }, { id: 'moon', longitudeDeg: 90 }];
  const result = layoutPlanetMarkers(bodies);
  assert.ok(Math.abs(result[0].x - 180) < 1e-9);
  assert.ok(Math.abs(result[0].y - 104) < 1e-9);
  assert.ok(Math.abs(result[1].x - 256) < 1e-9);
  assert.ok(Math.abs(result[1].y - 180) < 1e-9);
});

test('conjunction labels use separate lanes without changing planet coordinates', () => {
  const bodies = [{ id: 'sun', longitudeDeg: 120 }, { id: 'mercury', longitudeDeg: 120 }];
  const result = layoutPlanetMarkers(bodies);
  assert.equal(result[0].x, result[1].x);
  assert.equal(result[0].y, result[1].y);
  assert.ok(Math.hypot(result[0].labelX - result[1].labelX, result[0].labelY - result[1].labelY) >= 16);
  assert.deepEqual(bodies, [{ id: 'sun', longitudeDeg: 120 }, { id: 'mercury', longitudeDeg: 120 }]);
});

test('wheel layout rejects invalid longitudes', () => {
  assert.throws(() => layoutPlanetMarkers([{ id: 'sun', longitudeDeg: NaN }]), /Invalid longitude/);
});
