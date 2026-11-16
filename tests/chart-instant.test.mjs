import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = (name) => readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true }
}).outputText;
const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const validatorUrl = dataUrl(compile(load('chart-request.ts')));
const instantSource = load('chart-instant.ts').replace("from './chart-request'", "from '" + validatorUrl + "'");
const { toUtcInstantV1 } = await import(dataUrl(compile(instantSource)));
const base = { schemaVersion: 1, localDate: '2026-11-16', localTime: '13:30:00',
  utcOffsetMinutes: 60, latitude: 44.9, longitude: 8.6 };

test('converts local civil time using supplied offset only', () => {
  const result = toUtcInstantV1(base);
  assert.equal(result.ok, true);
  assert.equal(result.value.isoUtc, '2026-11-16T12:30:00.000Z');
  assert.equal(result.value.unixMilliseconds, Date.parse('2026-11-16T12:30:00.000Z'));
});

test('handles midnight rollover and fractional-hour offsets', () => {
  assert.equal(toUtcInstantV1({ ...base, localDate: '2024-01-01', localTime: '00:15:00',
    utcOffsetMinutes: 345 }).value.isoUtc, '2023-12-31T18:30:00.000Z');
  assert.equal(toUtcInstantV1({ ...base, localDate: '2024-12-31', localTime: '23:30:00',
    utcOffsetMinutes: -120 }).value.isoUtc, '2025-01-01T01:30:00.000Z');
});

test('preserves historical years 0001–0099 without JS 1900 remapping', () => {
  assert.equal(toUtcInstantV1({ ...base, localDate: '0099-01-01', localTime: '00:00:00',
    utcOffsetMinutes: 0 }).value.isoUtc, '0099-01-01T00:00:00.000Z');
});

test('rejects invalid inputs and UTC instants outside public year range', () => {
  assert.equal(toUtcInstantV1({ ...base, localTime: '25:00:00' }).ok, false);
  assert.deepEqual(toUtcInstantV1({ ...base, localDate: '0001-01-01', localTime: '00:00:00',
    utcOffsetMinutes: 60 }).errors, ['utcRange']);
});
