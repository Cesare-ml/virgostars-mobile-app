import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('current-sky DTO names the observer, time and provider provenance', () => {
  const contract = text('src/app/current-sky/contracts.ts');
  for (const field of ['capturedAtUtc','timezoneId','utcOffsetMinutes','latitudeDeg','longitudeDegEast','locationAccuracyMeters','provider','timeScale','coordinateFrame','houseCusps','aspects']) assert.match(contract, new RegExp(field));
});
test('native IPC fails closed instead of fabricating a chart', () => {
  const rust = text('src-tauri/src/lib.rs'); assert.match(rust, /fn calculate_current_sky\(/); assert.match(rust, /sky_engine_unavailable/);
  assert.doesNotMatch(rust, /positions:\s*vec!|house_cusps:\s*vec!/);
});
test('the initial screen is singular and has no demo chart or secondary dashboard', () => {
  const html = text('src/app/app.component.html'); const ts = text('src/app/app.component.ts');
  assert.match(html, /t\('title'\)/); assert.match(ts, /title: 'Il cielo di adesso'/);
  assert.doesNotMatch(html, /chart-illustration|bottom-nav|archive-list/);
});
