import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createDe441CivilProbeRequest,
  createDe441ProbeRequest,
  decodeDe441CivilProbeResponse,
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

test('civil adapter accepts an explicit timezone, never a device-local implicit timezone', () => {
  assert.deepEqual(createDe441CivilProbeRequest('2026-11-18T12:30:00+01:00', 'sun', 'earth'), {
    protocolVersion: 1, timestamp: '2026-11-18T12:30:00+01:00',
    target: 'sun', center: 'earth',
  });
  assert.throws(() => createDe441CivilProbeRequest('2026-11-18T12:30:00', 'sun', 'earth'));
  assert.throws(() => createDe441CivilProbeRequest('2026-11-18', 'sun', 'earth'));
  assert.throws(() => createDe441CivilProbeRequest('2026-11-18T12:30:00Z', 'sun', 'sun'));
  assert.throws(() => createDe441CivilProbeRequest('2026-11-18T12:30:00+01:00', 'invalid', 'earth'));
});

test('civil response identifies approximate TDB and closed historical UTC coverage', () => {
  const conversion = {
    jdTdb: 2461362.0,
    model: 'IERS_LEAP_SECONDS_USNO_TRUNCATED_TDB_TT',
    accuracy: 'approximate',
    utcCoverage: '1972-01-01/2027-06-27',
    source: 'virgostars_ephemeris_core',
  };
  const decoded = decodeDe441CivilProbeResponse({...good, conversion});
  assert.equal(decoded.conversion.jdTdb, 2461362.0);
  assert.equal(decoded.result.quantity, 'geometric');
  for (const malformed of [
    {...conversion, accuracy: 'high_precision'},
    {...conversion, model: 'JavaScript_date'},
    {...conversion, utcCoverage: '0000-01-01/2300-12-31'},
    {...conversion, jdTdb: Infinity},
  ]) {
    assert.throws(() => decodeDe441CivilProbeResponse({...good, conversion: malformed}));
  }
  assert.deepEqual(decodeDe441CivilProbeResponse({
    protocolVersion: 1, status: 'unsupported_utc', selectedPackId: null,
    result: null, conversion: null,
  }).status, 'unsupported_utc');
  assert.throws(() => decodeDe441CivilProbeResponse({...good, conversion: null}));
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
  assert.match(cargo, /de441-native-probe\s*=\s*\["de441-engine"\]/);
  assert.match(cargo, /de441-engine\s*=\s*\["dep:virgostars-ephemeris-core"\]/);
  assert.match(host, /de441_probe::de441_probe/);
  assert.match(host, /de441_probe::de441_probe_civil/);
  assert.match(rust, /CivilTimestamp::parse/);
  assert.match(rust, /to_approximate_tdb_julian_date/);
  assert.doesNotMatch(chart, /de441_probe|De441PackManager/);
  assert.doesNotMatch(rust, /reqwest|https:\/\/|download|chart_calculation/);
});
