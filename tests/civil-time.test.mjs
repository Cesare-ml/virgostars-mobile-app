import test from 'node:test';
import assert from 'node:assert/strict';
import {civilTimeToUtc, instantToCivil, instantToCivilExact, planRelocation, skyStepTarget, stepSky} from '../src/app/astro/civil-time.ts';
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
test('the current instant preserves its occurrence in a repeated local minute', () => {
  assert.deepEqual(instantToCivil(Date.parse('2024-10-27T00:30:45Z'), 'Europe/Rome'), {civil:'2024-10-27T02:30', occurrence:'earlier'});
  assert.deepEqual(instantToCivil(Date.parse('2024-10-27T01:30:45Z'), 'Europe/Rome'), {civil:'2024-10-27T02:30', occurrence:'later'});
  assert.equal(instantToCivil(Date.now(), 'Unknown/Zone'), null);
});
test('minute and hour steps follow elapsed time through DST gaps and overlaps', () => {
  assert.deepEqual(stepSky('2024-03-31T00:30:00Z', 'Europe/Rome', 'hour', 1), {civil:'2024-03-31T03:30', occurrence:''});
  assert.deepEqual(stepSky('2024-10-27T00:30:00Z', 'Europe/Rome', 'hour', 1), {civil:'2024-10-27T02:30', occurrence:'later'});
  assert.deepEqual(stepSky('2024-10-27T01:30:00Z', 'Europe/Rome', 'hour', -1), {civil:'2024-10-27T02:30', occurrence:'earlier'});
});
test('day steps keep wall time and refuse ambiguous or nonexistent destinations', () => {
  assert.deepEqual(stepSky('2024-03-30T11:00:00Z', 'Europe/Rome', 'day', 1), {civil:'2024-03-31T12:00', occurrence:''});
  assert.equal(stepSky('2024-03-30T01:30:00Z', 'Europe/Rome', 'day', 1), null);
  assert.equal(stepSky('2024-10-26T00:30:00Z', 'Europe/Rome', 'day', 1), null);
  for (const amount of [0, 31, 1.5, NaN]) assert.equal(stepSky('2024-01-01T00:00:00Z', 'UTC', 'day', amount), null);
});
test('calendar steps expose the precise DST destination without choosing an instant', () => {
  assert.deepEqual(skyStepTarget('2024-10-26T00:30:00Z', 'Europe/Rome', 'day', 1), {kind:'ambiguous',civil:'2024-10-27T02:30'});
  assert.deepEqual(skyStepTarget('2024-03-30T01:30:00Z', 'Europe/Rome', 'day', 1), {kind:'nonexistent',civil:'2024-03-31T02:30'});
  assert.deepEqual(skyStepTarget('2024-04-05T14:45:00Z', 'Australia/Lord_Howe', 'day', 1), {kind:'ambiguous',civil:'2024-04-07T01:45'});
  assert.deepEqual(skyStepTarget('2011-12-29T22:00:00Z', 'Pacific/Apia', 'day', 1), {kind:'nonexistent',civil:'2011-12-30T12:00'});
  assert.deepEqual(skyStepTarget('2024-03-30T11:00:00Z', 'Europe/Rome', 'day', 1), {kind:'ready',value:{civil:'2024-03-31T12:00',occurrence:''}});
  assert.deepEqual(skyStepTarget('2024-01-01T00:00:00Z', 'UTC', 'day', 0), {kind:'invalid'});
});
test('month and year steps clamp calendar dates and keep milliseconds and DST choices explicit', () => {
  assert.deepEqual(skyStepTarget('2024-01-31T12:00:45.123Z','UTC','month',1),{kind:'ready',value:{civil:'2024-02-29T12:00:45.123',occurrence:''}});
  assert.deepEqual(skyStepTarget('2024-02-29T12:00:45.123Z','UTC','year',1),{kind:'ready',value:{civil:'2025-02-28T12:00:45.123',occurrence:''}});
  assert.deepEqual(skyStepTarget('2024-09-27T00:30:00.000Z','Europe/Rome','month',1),{kind:'ambiguous',civil:'2024-10-27T02:30'});
  assert.deepEqual(skyStepTarget('2023-03-31T00:30:00.000Z','Europe/Rome','year',1),{kind:'nonexistent',civil:'2024-03-31T02:30'});
});
test('civil times accept seconds and up to three fractional digits without losing precision', () => {
  for (const [civil, iso] of [
    ['2024-01-01T12:00:45','2024-01-01T11:00:45.000Z'],
    ['2024-01-01T12:00:45.1','2024-01-01T11:00:45.100Z'],
    ['2024-01-01T12:00:45.12','2024-01-01T11:00:45.120Z'],
    ['2024-01-01T12:00:45.123','2024-01-01T11:00:45.123Z'],
    ['1890-01-01T12:00:37.125','1890-01-01T11:51:16.125Z'],
  ]) {
    const zone = civil.startsWith('1890') ? 'Europe/Paris' : 'Europe/Rome';
    assert.deepEqual(civilTimeToUtc(civil, zone), {kind:'ready', utcIso:iso});
    const back = instantToCivilExact(Date.parse(iso), zone);
    assert.ok(back);
    assert.deepEqual(civilTimeToUtc(back.civil, zone, back.occurrence), {kind:'ready', utcIso:iso});
  }
  for (const bad of ['2024-01-01T12:00:60','2024-01-01T12:00:45.1234','2024-02-30T12:00:00.001','2024-01-01T12:00.123']) {
    assert.equal(civilTimeToUtc(bad, 'UTC').kind, 'invalid');
  }
});
test('exact navigation and overlap resolution preserve milliseconds', () => {
  const first = '2024-10-27T00:30:45.123Z', second = '2024-10-27T01:30:45.123Z';
  assert.deepEqual(instantToCivilExact(Date.parse(first), 'Europe/Rome'), {civil:'2024-10-27T02:30:45.123', occurrence:'earlier'});
  assert.deepEqual(instantToCivilExact(Date.parse(second), 'Europe/Rome'), {civil:'2024-10-27T02:30:45.123', occurrence:'later'});
  assert.deepEqual(stepSky(first, 'Europe/Rome', 'hour', 1), {civil:'2024-10-27T02:30:45.123', occurrence:'later'});
  assert.deepEqual(stepSky(second, 'Europe/Rome', 'minute', -1), {civil:'2024-10-27T02:29:45.123', occurrence:'later'});
  assert.deepEqual(skyStepTarget('2024-10-26T00:30:45.123Z', 'Europe/Rome', 'day', 1), {kind:'ambiguous', civil:'2024-10-27T02:30:45.123'});
  assert.deepEqual(skyStepTarget('2024-03-30T01:30:45.123Z', 'Europe/Rome', 'day', 1), {kind:'nonexistent', civil:'2024-03-31T02:30:45.123'});
  assert.deepEqual(civilTimeToUtc('2024-10-27T02:30:45.123','Europe/Rome','later'), {kind:'ready',utcIso:second});
  assert.equal(instantToCivilExact(Date.parse(first) + 0.5, 'Europe/Rome'), null);
});
test('relocation explicitly preserves either the instant or the wall time', () => {
  const utc = '2024-01-01T12:34:56.123Z';
  const instant = planRelocation(utc, 'UTC', '35.6', '139.7', 'Asia/Tokyo', 'instant', '');
  assert.equal(instant.kind, 'ready');
  assert.equal(instant.utcIso, utc);
  assert.deepEqual(instant.local, {civil:'2024-01-01T21:34:56.123', occurrence:''});
  const wall = planRelocation(utc, 'UTC', '35.6', '139.7', 'Asia/Tokyo', 'wall', '');
  assert.equal(wall.kind, 'ready');
  assert.equal(wall.utcIso, '2024-01-01T03:34:56.123Z');
  assert.equal(wall.local.civil, '2024-01-01T12:34:56.123');
});
test('relocation rejects gaps, requires a choice for overlaps and never guesses coordinates', () => {
  const overlap = '2024-10-27T02:30:45.123Z';
  assert.equal(planRelocation(overlap, 'UTC', '0','0','Europe/Rome','wall','').kind, 'ambiguous');
  assert.equal(planRelocation(overlap, 'UTC', '0','0','Europe/Rome','wall','earlier').utcIso, '2024-10-27T00:30:45.123Z');
  assert.equal(planRelocation(overlap, 'UTC', '0','0','Europe/Rome','wall','later').utcIso, '2024-10-27T01:30:45.123Z');
  assert.equal(planRelocation('2024-03-31T02:30:45.123Z','UTC','0','0','Europe/Rome','wall','later').kind, 'nonexistent');
  assert.equal(planRelocation(overlap,'UTC','','0','UTC','instant','').kind, 'invalid_coordinates');
  assert.equal(planRelocation(overlap,'UTC','91','0','UTC','instant','').kind, 'invalid_coordinates');
  assert.equal(planRelocation(overlap,'UTC','0','181','UTC','instant','').kind, 'invalid_coordinates');
  assert.equal(planRelocation(overlap,'UTC','0','0','Unknown/Zone','instant','').kind, 'unknown_zone');
  assert.equal(planRelocation(overlap,'UTC','0','0','UTC','other','').kind, 'invalid_time');
});
