import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCurrentSky,
  CURRENT_SKY_ENGINE,
  CURRENT_SKY_REFRESH_MS
} from '../src/app/current-sky-engine.mjs';

test('current sky returns ten real geocentric planetary positions', () => {
  const instant = new Date('2026-11-16T11:00:00.000Z');
  const snapshot = calculateCurrentSky(instant);

  assert.equal(snapshot.contract, 'VirgoStarsCurrentSky');
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.datetimeUtc, instant.toISOString());
  assert.equal(snapshot.coordinateCenter, 'EARTH');
  assert.equal(snapshot.coordinateFrame, 'ECLIPTIC_OF_DATE');
  assert.equal(snapshot.positionType, 'GEOCENTRIC');
  assert.equal(snapshot.zodiac, 'TROPICAL');
  assert.equal(snapshot.engine, CURRENT_SKY_ENGINE);
  assert.equal(snapshot.refreshIntervalMs, CURRENT_SKY_REFRESH_MS);
  assert.equal(snapshot.bodies.length, 10);
  assert.deepEqual(snapshot.bodies.map(body => body.id), [
    'sun', 'moon', 'mercury', 'venus', 'mars',
    'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'
  ]);

  for (const body of snapshot.bodies) {
    assert.ok(Number.isFinite(body.longitudeDeg), body.id);
    assert.ok(body.longitudeDeg >= 0 && body.longitudeDeg < 360, body.id);
    assert.ok(Number.isFinite(body.latitudeDeg), body.id);
    assert.ok(body.signIndex >= 0 && body.signIndex < 12, body.id);
    assert.ok(body.degreeInSign >= 0 && body.degreeInSign < 30, body.id);
    assert.equal(body.signIndex, Math.floor(body.longitudeDeg / 30), body.id);
  }
});

test('same UTC instant gives deterministic positions', () => {
  const instant = new Date('2026-11-16T11:00:00.000Z');
  const first = calculateCurrentSky(instant);
  const second = calculateCurrentSky(instant);
  assert.deepEqual(first.bodies, second.bodies);
});

test('invalid instants fail closed instead of returning synthetic data', () => {
  assert.throws(() => calculateCurrentSky(new Date(Number.NaN)), /valid JavaScript Date/);
  assert.throws(() => calculateCurrentSky('2026-11-16T11:00:00Z'), /valid JavaScript Date/);
});

test('snapshot and planetary positions are immutable', () => {
  const snapshot = calculateCurrentSky(new Date('2026-11-16T11:00:00.000Z'));
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.bodies));
  assert.ok(snapshot.bodies.every(Object.isFrozen));
});
