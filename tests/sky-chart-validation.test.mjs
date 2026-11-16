import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkyChart } from '../src/app/current-sky/current-sky.models.ts';

const ids = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const valid = () => ({
  zodiac: 'tropical',
  bodies: ids.map((id, index) => ({ id, longitude: index * 30 }))
});

test('accepts complete, finite, unique tropical positions', () => {
  assert.deepEqual(parseSkyChart(valid()), valid());
});

test('rejects missing or duplicated planetary positions', () => {
  const missing = valid();
  missing.bodies.pop();
  assert.equal(parseSkyChart(missing), null);
  const duplicate = valid();
  duplicate.bodies[9].id = 'sun';
  assert.equal(parseSkyChart(duplicate), null);
});

test('rejects invalid zodiac and out-of-range longitude', () => {
  assert.equal(parseSkyChart({ ...valid(), zodiac: 'sidereal' }), null);
  for (const longitude of [-1, 360, Number.NaN, Number.POSITIVE_INFINITY]) {
    const bad = valid();
    bad.bodies[0].longitude = longitude;
    assert.equal(parseSkyChart(bad), null);
  }
});

test('rejects non-object and malformed payloads', () => {
  for (const value of [null, [], 'chart', {}, { zodiac: 'tropical', bodies: null }]) {
    assert.equal(parseSkyChart(value), null);
  }
});
