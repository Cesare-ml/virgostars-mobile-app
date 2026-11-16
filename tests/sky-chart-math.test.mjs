import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAscendant,
  formatDegreeMinute,
  normalizeDegrees
} from '../src/app/sky-chart-math.js';

const obliquity = 23.4392911 * Math.PI / 180;
const cosine = Math.cos(obliquity);
const sine = Math.sin(obliquity);
const eqdToEct = [
  [1, 0, 0],
  [0, cosine, -sine],
  [0, sine, cosine]
];

test('normalizes positive, negative and wrapped angles', () => {
  assert.equal(normalizeDegrees(0), 0);
  assert.equal(normalizeDegrees(360), 0);
  assert.equal(normalizeDegrees(-10), 350);
  assert.equal(normalizeDegrees(725), 5);
  assert.throws(() => normalizeDegrees(Number.NaN), RangeError);
});

test('selects the eastern Ascendant at the equator for cardinal sidereal angles', () => {
  for (const sidereal of [0, 90, 180, 270]) {
    const result = calculateAscendant(eqdToEct, 0, sidereal);
    assert.ok(Math.abs(result.longitudeDegrees - normalizeDegrees(sidereal + 90)) < 1e-9);
    assert.ok(result.eastProjection > 0);
  }
});

test('returns a normalized eastern horizon intersection at varied latitudes', () => {
  for (const latitude of [-66, -35, 10, 48, 80]) {
    for (const sidereal of [0, 67, 180, 299]) {
      const result = calculateAscendant(eqdToEct, latitude, sidereal);
      assert.ok(result.longitudeDegrees >= 0 && result.longitudeDegrees < 360);
      assert.ok(result.eastProjection >= -1e-12);
    }
  }
});

test('rejects malformed rotation matrices and invalid coordinates', () => {
  assert.throws(() => calculateAscendant([[1, 0], [0, 1]], 0, 0), RangeError);
  assert.throws(() => calculateAscendant(eqdToEct, 91, 0), RangeError);
  assert.throws(() => calculateAscendant(eqdToEct, 0, Number.NaN), RangeError);
});

test('formats zodiac degrees and minutes without carrying into the next sign', () => {
  assert.equal(formatDegreeMinute(0), '0° 0.0′');
  assert.equal(formatDegreeMinute(0.5), '0° 30.0′');
  assert.equal(formatDegreeMinute(20.25), '20° 15.0′');
  assert.equal(formatDegreeMinute(29.999999), '29° 59.9′');
  assert.throws(() => formatDegreeMinute(30), RangeError);
});
