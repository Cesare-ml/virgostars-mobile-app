import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurrentSky, ZODIAC_SIGNS } from '../src/app/current-sky.mjs';

test('calculates ten geocentric planetary longitudes for a requested instant', () => {
  const instant = new Date('2026-11-16T11:00:00.000Z');
  const chart = calculateCurrentSky(instant);
  assert.equal(chart.instant, instant.toISOString());
  assert.equal(chart.provider, 'Astronomy Engine 2.1.19');
  assert.deepEqual(chart.planets.map((p) => p.id), [
    'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'
  ]);
  for (const p of chart.planets) {
    assert.ok(Number.isFinite(p.longitude) && p.longitude >= 0 && p.longitude < 360);
    assert.ok(p.signIndex >= 0 && p.signIndex < 12);
    assert.ok(p.degree >= 0 && p.degree < 30);
    assert.ok(p.minute >= 0 && p.minute < 60);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('tropical zodiac has twelve ordered signs', () => {
  assert.deepEqual(ZODIAC_SIGNS.map((s) => s.id), [
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
  ]);
});

test('same instant produces deterministic results', () => {
  const instant = '2026-01-01T00:00:00.000Z';
  assert.deepEqual(calculateCurrentSky(instant), calculateCurrentSky(instant));
});

test('invalid device clock is rejected instead of returning invented positions', () => {
  assert.throws(() => calculateCurrentSky(new Date(Number.NaN)), /valid instant/i);
});
