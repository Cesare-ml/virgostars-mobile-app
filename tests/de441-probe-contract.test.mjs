import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createDe441ProbeRequest,
  decodeDe441ProbeResponse,
} from '../src/app/native/de441-probe-contract.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const good = {
  protocolVersion: 1,
  status: 'ok',
  selectedPackId: 'core',
  result: {
    positionKm: [149597870.7, 100, -42],
    velocityKmPerDay: [1000, 1.5, -0.1],
    frame: 'ICRF/J2000', quantity: 'geometric', epochScale: 'TDB',
    lengthUnit: 'km', speedUnit: 'km/day', source: 'de441_classic',
  },
};

test('probe requires explicitly named JD TDB and two distinct known bodies', () => {
  assert.deepEqual(createDe441ProbeRequest(2451545, 'sun', 'earth'), {
    protocolVersion: 1, jdTdb: 2451545, target: 'sun', center: 'earth',
  });
  assert.throws(() => createDe441ProbeRequest(NaN, 'sun', 'earth'));
  assert.throws(() => createDe441ProbeRequest(Infinity, 'sun', 'earth'));
  assert.throws(() => createDe441ProbeRequest(2451545, 'sun', 'sun'));
  assert.throws(() => createDe441ProbeRequest(2451545, 'bogus', 'earth'));
});

test('diagnostic accepts only finite geometric ICRF state with explicit units', () => {
  const decoded = decodeDe441ProbeResponse(good);
  assert.equal(decoded.result.source, 'de441_classic');
  assert.equal(decoded.result.epochScale, 'TDB');
  assert.ok(Object.isFrozen(decoded.result.positionKm));
  for (const change of [
    {result: {...good.result, frame: 'ecliptic-of-date'}},
    {result: {...good.result, quantity: 'apparent'}},
    {result: {...good.result, epochScale: 'UTC'}},
    {result: {...good.result, lengthUnit: 'au'}},
    {result: {...good.result, speedUnit: 'km/s'}},
    {result: {...good.result, positionKm: [0, NaN, 0]}},
    {result: {...good.result, velocityKmPerDay: [0, Infinity, 0]}},
    {result: {...good.result, positionKm: [0, 1]}},
  ]) {
    assert.throws(() => decodeDe441ProbeResponse({...good, ...change}));
  }
  assert.throws(() => decodeDe441ProbeResponse({...good, protocolVersion: 2}));
  assert.throws(() => decodeDe441ProbeResponse({...good, selectedPackId: '../../de441.eph'}));
});

test('feature-off and missing-pack states contain no astronomical results', () => {
  assert.deepEqual(decodeDe441ProbeResponse({
    protocolVersion: 1, status: 'provider_unavailable', selectedPackId: null, result: null,
  }).status, 'provider_unavailable');
  assert.deepEqual(decodeDe441ProbeResponse({
    protocolVersion: 1, status: 'missing_pack', selectedPackId: 'history-0000-0199', result: null,
  }).status, 'missing_pack');
  assert.throws(() => decodeDe441ProbeResponse({...good, status: 'missing_pack'}));
  assert.throws(() => decodeDe441ProbeResponse({...good, result: null}));
});

test('Rust host uses the canonical DE441 reader behind opt-in feature, without chart wiring', () => {
  const rust = read('src-tauri/src/de441_probe.rs');
  const chart = read('src-tauri/src/chart_calculation.rs');
  const cargo = read('src-tauri/Cargo.toml');
  const host = read('src-tauri/src/lib.rs');
  assert.match(rust, /De441PackManager::from_mobile_directory/);
  assert.match(rust, /verify_pack_in_directory/);
  assert.match(rust, /spawn_blocking/);
  assert.match(rust, /"ICRF\/J2000"/);
  assert.match(rust, /"geometric"/);
  assert.match(cargo, /de441-native-probe\s*=\s*\["dep:virgostars-ephemeris-core"\]/);
  assert.match(host, /de441_probe::de441_probe/);
  assert.doesNotMatch(chart, /de441_probe|De441PackManager/);
  assert.doesNotMatch(rust, /reqwest|https:\/\/|download|chart_calculation/);
});
