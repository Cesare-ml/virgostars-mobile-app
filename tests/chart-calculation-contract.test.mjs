import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_BODY_IDS, HOUSE_SYSTEM_IDS, decodeChartResponse, requestChart, validChartRequest,
} from '../src/app/native/chart-calculation-contract.ts';

// Visibly fictional values: evenly spaced longitudes, not an ephemeris.
function body(id, index) {
  return {
    id, longitudeDeg: index * 20 + 0.5, latitudeDeg: index % 2 ? -1 : 1, distanceAu: 1 + index,
    longitudeSpeed: index === 4 ? -0.3 : 0.9, latitudeSpeed: 0.01, distanceSpeed: 0.001,
    rightAscensionDeg: index * 20 + 1.5, declinationDeg: index - 7, ephemerisSource: 'moshier',
  };
}
function houseSystem(id) {
  return {
    id, cuspsDeg: Array.from({length: 12}, (_, index) => (85 + index * 30) % 360),
    ascendantDeg: 100, mcDeg: 10, armcDeg: 11, vertexDeg: 220,
  };
}
function okResponse() {
  const computed = CHART_BODY_IDS.filter(id => id !== 'Chiron');
  return {
    protocolVersion: 1, status: 'ok',
    provider: {id: 'swiss_ephemeris', engineVersion: '2.10.03'},
    chart: {
      julianDayUt: 2451545.0,
      bodies: computed.map(body),
      houses: HOUSE_SYSTEM_IDS.map(houseSystem),
      unavailableBodies: ['Chiron'],
      unavailableHouseSystems: [],
    },
  };
}
const REQUEST = Object.freeze({utcIso: '2001-02-03T04:05:06Z', latMicro: 44_697_805, lngMicro: 11_805_778});

test('a complete native response is copied into detached frozen values', () => {
  const raw = okResponse();
  const decoded = decodeChartResponse(raw);
  assert.equal(decoded.status, 'ok');
  assert.deepEqual(decoded.provider, {id: 'swiss_ephemeris', engineVersion: '2.10.03'});
  assert.equal(decoded.chart.bodies.length, 14);
  assert.equal(decoded.chart.houses.length, 5);
  assert.deepEqual(decoded.chart.unavailableBodies, ['Chiron']);
  assert.ok(Object.isFrozen(decoded.chart) && Object.isFrozen(decoded.chart.bodies[0]) &&
    Object.isFrozen(decoded.chart.houses[0].cuspsDeg));
  raw.chart.bodies[0].longitudeDeg = 359;
  assert.equal(decoded.chart.bodies[0].longitudeDeg, 0.5);
});

test('failure statuses carry no provider or chart', () => {
  for (const status of ['provider_unavailable', 'invalid_request', 'calculation_failed']) {
    assert.deepEqual(decodeChartResponse({protocolVersion: 1, status, provider: null, chart: null}), {status});
  }
});

test('malformed, out-of-range or contradictory responses are rejected with one generic error', () => {
  const mutations = [
    r => { r.protocolVersion = 2; },
    r => { r.status = 'fine'; },
    r => { r.provider.id = 'Swiss Ephemeris; rm'; },
    r => { r.provider.engineVersion = 'C:\\Users\\someone'; },
    r => { r.chart.julianDayUt = Number.NaN; },
    r => { r.chart.bodies[0].longitudeDeg = 360; },
    r => { r.chart.bodies[0].longitudeDeg = -0.1; },
    r => { r.chart.bodies[1].latitudeDeg = 91; },
    r => { r.chart.bodies[2].longitudeSpeed = Number.POSITIVE_INFINITY; },
    r => { r.chart.bodies[3].ephemerisSource = 'guess'; },
    r => { r.chart.bodies[3].id = 'Vulcan'; },
    r => { r.chart.bodies[3].id = 'Sun'; },
    r => { r.chart.bodies.shift(); },
    r => { r.chart.unavailableBodies.push('Mars'); },
    r => { r.chart.unavailableBodies = ['Chiron', 'Chiron']; },
    r => { r.chart.houses[0].cuspsDeg.pop(); },
    r => { r.chart.houses[0].cuspsDeg[3] = '120'; },
    r => { r.chart.houses[1].id = 'egizia'; },
    r => { r.chart.houses[1].id = 'whole-sign'; },
    r => { delete r.chart.houses[0].vertexDeg; },
    r => { r.chart.bodies.length = 20; },
    r => { Object.defineProperty(r.chart.bodies[0], 'longitudeDeg', {get: () => 1, enumerable: true}); },
    r => { r.chart = Object.create({bodies: []}); },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const raw = okResponse();
    mutate(raw);
    assert.throws(() => decodeChartResponse(raw), {message: 'Invalid chart calculation protocol'}, 'mutation ' + index);
  }
  for (const raw of [null, undefined, 'ok', [], new Map()]) {
    assert.throws(() => decodeChartResponse(raw), {message: 'Invalid chart calculation protocol'});
  }
});

test('request bounds are enforced before any native call', async () => {
  assert.ok(validChartRequest(REQUEST));
  assert.ok(validChartRequest({...REQUEST, utcIso: '2001-02-03T04:05:06.250Z'}));
  const calls = [];
  const transport = {isNative: () => true, invoke: async (...args) => { calls.push(args); return okResponse(); }};
  for (const bad of [
    {...REQUEST, utcIso: '2001-02-03T04:05:06+01:00'},
    {...REQUEST, utcIso: '2001-02-03 04:05:06Z'},
    {...REQUEST, latMicro: 90_000_001},
    {...REQUEST, lngMicro: -180_000_001},
    {...REQUEST, latMicro: 44.5},
    {...REQUEST, lngMicro: Number.NaN},
    null,
  ]) {
    assert.deepEqual(await requestChart(transport, bad), {kind: 'invalid_request'});
  }
  assert.equal(calls.length, 0);
});

test('one native call carries only the versioned instant and position', async () => {
  const calls = [];
  const transport = {isNative: () => true, invoke: async (...args) => { calls.push(args); return okResponse(); }};
  const result = await requestChart(transport, {...REQUEST, name: 'never forwarded'});
  assert.equal(result.kind, 'ready');
  assert.equal(result.provider.id, 'swiss_ephemeris');
  assert.deepEqual(calls, [['calculate_chart', {
    request: {protocolVersion: 1, utcIso: REQUEST.utcIso, latMicro: REQUEST.latMicro, lngMicro: REQUEST.lngMicro},
  }]]);
});

test('browser preview, missing provider and native failures stay distinct and opaque', async () => {
  const never = async () => { throw new Error('must not be called'); };
  assert.deepEqual(await requestChart({isNative: () => false, invoke: never}, REQUEST), {kind: 'not_native'});
  for (const status of ['provider_unavailable', 'invalid_request', 'calculation_failed']) {
    const transport = {isNative: () => true, invoke: async () => ({protocolVersion: 1, status, provider: null, chart: null})};
    assert.deepEqual(await requestChart(transport, REQUEST), {kind: status});
  }
  const rejected = {isNative: () => true, invoke: async () => { throw new Error('C:\\private\\path birth data'); }};
  assert.deepEqual(await requestChart(rejected, REQUEST), {kind: 'unavailable'});
  const garbage = {isNative: () => true, invoke: async () => ({protocolVersion: 1, status: 'ok'})};
  assert.deepEqual(await requestChart(garbage, REQUEST), {kind: 'unavailable'});
  const throwingProbe = {isNative: () => { throw new Error('no bridge'); }, invoke: never};
  assert.deepEqual(await requestChart(throwingProbe, REQUEST), {kind: 'unavailable'});
});
