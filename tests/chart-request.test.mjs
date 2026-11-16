import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/chart-request.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true },
  reportDiagnostics: true
});
assert.deepEqual(compiled.diagnostics ?? [], []);
const { validateChartRequestV1: validate } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64')
);
const valid = Object.freeze({
  schemaVersion: 1, localDate: '2024-02-29', localTime: '23:59:59',
  utcOffsetMinutes: 345, latitude: 45.1, longitude: -73.2
});

test('accepts valid leap day and quarter-hour timezone without mutation', () => {
  assert.deepEqual(validate(valid), { ok: true, value: valid });
});

test('rejects impossible civil dates and malformed local times', () => {
  for (const localDate of ['2023-02-29', '2024-04-31', '0000-01-01', '2024-13-01']) {
    assert.ok(validate({ ...valid, localDate }).errors.includes('localDate'));
  }
  for (const localTime of ['24:00:00', '12:60:00', '12:00', '12:00:60']) {
    assert.ok(validate({ ...valid, localTime }).errors.includes('localTime'));
  }
});

test('rejects invalid coordinates, offsets, unknown fields and schema changes', () => {
  for (const change of [
    { latitude: 91 }, { longitude: -181 }, { latitude: NaN },
    { utcOffsetMinutes: 841 }, { utcOffsetMinutes: 1.5 },
    { schemaVersion: 2 }, { secret: 'never accepted' }
  ]) assert.equal(validate({ ...valid, ...change }).ok, false);
  assert.equal(validate(null).ok, false);
});

test('accepts geographic poles, dateline and UTC offset boundaries', () => {
  assert.equal(validate({ ...valid, latitude: -90, longitude: 180, utcOffsetMinutes: -720 }).ok, true);
  assert.equal(validate({ ...valid, latitude: 90, longitude: -180, utcOffsetMinutes: 840 }).ok, true);
});
