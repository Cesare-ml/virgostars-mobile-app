import test from 'node:test';
import assert from 'node:assert/strict';
import {chartHeaderTime} from '../src/app/astro/chart-header.ts';
test('chart header presents the correct historical local time and GMT offset',()=>{
  assert.equal(chartHeaderTime('2000-01-01T12:00:00.000Z','Europe/Rome'),'01/01/2000 13:00 · GMT+01:00');
  assert.equal(chartHeaderTime('2024-07-01T12:00:00.000Z','Europe/Rome'),'01/07/2024 14:00 · GMT+02:00');
  assert.equal(chartHeaderTime('2024-07-01T12:00:00.000Z','America/New_York'),'01/07/2024 08:00 · GMT-04:00');
  assert.equal(chartHeaderTime('invalid','UTC'),'');
});
