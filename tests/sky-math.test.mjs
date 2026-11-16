import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the same TypeScript math module imported by LiveSkyService, not a copied formula.
const source = readFileSync(new URL('../src/app/sky-math.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const { normalizeDegrees, tropicalPosition } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);

test('tropical longitude wraps around Aries and Pisces', () => {
  assert.deepEqual(tropicalPosition(0), { longitude: 0, signIndex: 0, signDegree: 0 });
  assert.deepEqual(tropicalPosition(360), { longitude: 0, signIndex: 0, signDegree: 0 });
  assert.deepEqual(tropicalPosition(-1), { longitude: 359, signIndex: 11, signDegree: 29 });
  assert.deepEqual(tropicalPosition(30), { longitude: 30, signIndex: 1, signDegree: 0 });
  assert.deepEqual(tropicalPosition(390), { longitude: 30, signIndex: 1, signDegree: 0 });
});

test('all twelve zodiac sign boundaries are stable', () => {
  for (let sign = 0; sign < 12; sign++) {
    const atBoundary = tropicalPosition(sign * 30);
    assert.equal(atBoundary.signIndex, sign);
    assert.equal(atBoundary.signDegree, 0);
    const beforeBoundary = tropicalPosition(sign * 30 - 0.001);
    assert.equal(beforeBoundary.signIndex, (sign + 11) % 12);
  }
});

test('invalid astronomical longitudes cannot reach the chart', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => normalizeDegrees(value), RangeError);
  }
});
