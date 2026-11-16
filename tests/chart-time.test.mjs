import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/chart-time.ts', import.meta.url), 'utf8')
  .replace("import { validateChartRequestV1, type ChartRequestV1 } from './chart-request';",
    "import { validateChartRequestV1 } from './chart-request';");
const validator = readFileSync(new URL('../src/app/chart-request.ts', import.meta.url), 'utf8');
const compile = (input) => ts.transpileModule(input, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const validatorUrl = 'data:text/javascript;base64,' + Buffer.from(compile(validator)).toString('base64');
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(
  compile(source).replace("from './chart-request'", "from '" + validatorUrl + "'")
).toString('base64');
const { chartRequestUtcIso } = await import(moduleUrl);
const base = {
  schemaVersion: 1, localDate: '2024-01-01', localTime: '00:15:00',
  utcOffsetMinutes: 345, latitude: 0, longitude: 0
};

test('UTC conversion crosses previous date without device timezone inference', () => {
  assert.equal(chartRequestUtcIso(base), '2023-12-31T18:30:00.000Z');
});

test('negative offset crosses forward into next day', () => {
  assert.equal(chartRequestUtcIso({ ...base, utcOffsetMinutes: -720, localTime: '23:30:00' }),
    '2024-01-02T11:30:00.000Z');
});

test('leap date, historical year and invalid input', () => {
  assert.equal(chartRequestUtcIso({ ...base, localDate: '2024-02-29', localTime: '12:00:00', utcOffsetMinutes: 0 }),
    '2024-02-29T12:00:00.000Z');
  assert.equal(chartRequestUtcIso({ ...base, localDate: '0099-01-01', utcOffsetMinutes: 0 }),
    '0099-01-01T00:15:00.000Z');
  assert.equal(chartRequestUtcIso({ ...base, localDate: '2023-02-29' }), null);
});
