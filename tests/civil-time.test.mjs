import test from 'node:test';
import assert from 'node:assert/strict';
import {civilTimeToUtc} from '../src/app/astro/civil-time.ts';
test('UTC and ordinary civil times resolve without using the device time zone', () => {
  assert.deepEqual(civilTimeToUtc('2000-01-01T12:00','UTC'),{kind:'ready',utcIso:'2000-01-01T12:00:00.000Z'});
  assert.deepEqual(civilTimeToUtc('2024-01-01T12:00','Europe/Rome'),{kind:'ready',utcIso:'2024-01-01T11:00:00.000Z'});
});
test('DST gap fails and overlap requires an explicit choice', () => {
  assert.equal(civilTimeToUtc('2024-03-31T02:30','Europe/Rome').kind,'nonexistent');
  assert.equal(civilTimeToUtc('2024-10-27T02:30','Europe/Rome').kind,'ambiguous');
  assert.equal(civilTimeToUtc('2024-10-27T02:30','Europe/Rome','earlier').utcIso,'2024-10-27T00:30:00.000Z');
  assert.equal(civilTimeToUtc('2024-10-27T02:30','Europe/Rome','later').utcIso,'2024-10-27T01:30:00.000Z');
});
test('invalid calendar dates and unknown zones are rejected', () => {
  assert.equal(civilTimeToUtc('2024-02-30T10:00','UTC').kind,'invalid');
  assert.equal(civilTimeToUtc('2024-02-01T10:00','Nowhere/Unknown').kind,'unknown_zone');
});