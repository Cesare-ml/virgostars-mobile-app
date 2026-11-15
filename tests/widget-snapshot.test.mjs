import test from 'node:test';
import assert from 'node:assert/strict';
import { presentWidgetSnapshot } from '../src/app/native/widget-snapshot.ts';

const now = new Date('2026-11-15T12:00:00.000Z');
const base = {
  schemaVersion: 1, kind: 'moon-phase', calculatedAtUtc: '2026-11-15T11:00:00.000Z',
  validUntilUtc: '2026-11-15T13:00:00.000Z',
  engineVersion: 'fictional-tested-engine-version',
  calculationSource: 'virgostars-ephemeris', data: { moonPhase: 'full' }
};
const show = (snapshot, opts = {}) => presentWidgetSnapshot(snapshot, { vaultUnlocked: true, now, ...opts });

test('renders a bounded, public Moon label without computing positions', () => {
  assert.deepEqual(show(base), {
    state: 'ready', title: 'VirgoStars', kind: 'moon-phase', label: 'Luna piena',
    validUntilUtc: '2026-11-15T13:00:00.000Z', canOpenApp: true
  });
});

test('vault lock hides valid and invalid data uniformly', () => {
  const locked = { state: 'locked', title: 'VirgoStars', message: 'Sblocca VirgoStars', canOpenApp: true };
  assert.deepEqual(presentWidgetSnapshot(base, { vaultUnlocked: false, now }), locked);
  assert.deepEqual(presentWidgetSnapshot(null, { vaultUnlocked: false, now }), locked);
});

test('stale, future and excessively long validity windows fail closed', () => {
  for (const candidate of [
    { validUntilUtc: '2026-11-15T12:00:00.000Z' },
    { calculatedAtUtc: '2026-11-15T13:00:00.000Z' },
    { validUntilUtc: '2026-11-17T13:00:00.000Z' },
    { validUntilUtc: '2026-11-15T10:00:00.000Z' },
    { calculatedAtUtc: '2026-02-31T11:00:00.000Z' }
  ]) assert.equal(show({ ...base, ...candidate }).state, 'unavailable');
});

test('rejects unexpected fields that may contain personal data', () => {
  for (const candidate of [
    { ...base, clientName: 'Sensitive name' },
    { ...base, data: { moonPhase: 'full', birthDate: 'PRIVATE' } },
    { ...base, data: { moonPhase: 'full', latitude: 44 } },
    { ...base, data: { moonPhase: '<script>alert(1)</script>' } }
  ]) assert.equal(show(candidate).state, 'unavailable');
});

test('rejects unsupported versions, invalid provenance and empty engine id', () => {
  for (const candidate of [
    { ...base, schemaVersion: 2 },
    { ...base, calculationSource: 'unknown' },
    { ...base, engineVersion: '' },
    { ...base, kind: 'solar-return' }
  ]) assert.equal(show(candidate).state, 'unavailable');
});

test('handles the seven recognized planetary rulers without ad-hoc calculations', () => {
  const item = { ...base, kind: 'planetary-hour', data: { planetaryRuler: 'mercury' } };
  assert.equal(show(item).label, 'Ora di Mercurio');
  assert.equal(show({ ...item, data: { planetaryRuler: 'neptune' } }).state, 'unavailable');
});

test('only shows upcoming, public event categories', () => {
  const item = { ...base, kind: 'next-event', data: {
    eventKind: 'planetary-ingress', eventAtUtc: '2026-11-15T12:15:00.000Z'
  }};
  assert.equal(show(item).label, 'Ingresso planetario');
  assert.equal(show({ ...item, data: { ...item.data, eventAtUtc: '2026-11-15T11:00:00.000Z' } }).state, 'unavailable');
  assert.equal(show({ ...item, data: { ...item.data, eventKind: 'client-consultation' } }).state, 'unavailable');
});

test('handles missing and malformed data without throwing', () => {
  for (const item of [null, undefined, {}, { ...base, data: null },
    { ...base, data: {} }, { ...base, validUntilUtc: 'garbage' }]) {
    assert.equal(show(item).state, 'unavailable');
  }
});
