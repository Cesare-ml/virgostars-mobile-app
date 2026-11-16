import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('current-sky DTO names the observer, time and provider provenance', () => {
  const contract = text('src/app/current-sky/contracts.ts');
  for (const field of ['capturedAtUtc','timezoneId','utcOffsetMinutes','latitudeDeg','longitudeDegEast','locationAccuracyMeters','provider','timeScale','coordinateFrame','houseCusps','aspects']) assert.match(contract, new RegExp(field));
});

test('native IPC is stateful, strictly validates UTC and fails closed without a provider', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /trait CurrentSkyProvider: Send \+ Sync/);
  assert.match(rust, /CurrentSkyProviderState/);
  assert.match(rust, /is_valid_utc_timestamp/);
  assert.match(rust, /sky_engine_unavailable/);
  assert.doesNotMatch(rust, /positions:\s*vec!|house_cusps:\s*vec!/);
});

test('native geolocation is mobile scoped and one-shot', () => {
  const cargo = text('src-tauri/Cargo.toml');
  const capabilities = JSON.parse(text('src-tauri/capabilities/default.json'));
  assert.match(cargo, /cfg\(any\(target_os = "android", target_os = "ios"\)\)/);
  assert.match(cargo, /tauri-plugin-geolocation/);
  assert.equal(capabilities.permissions.some((permission) => permission.includes('watch')), false);
});

test('the single screen requests consent and contains no fabricated chart', () => {
  const html = text('src/app/app.component.html');
  const component = text('src/app/app.component.ts');
  const service = text('src/app/current-sky/current-sky.service.ts');
  assert.match(component, /title: 'Il cielo di adesso'/);
  assert.match(component, /allowLocation: 'Consenti posizione'/);
  assert.match(html, /Powered by VirgoStars/);
  assert.doesNotMatch(html, /chart-illustration|bottom-nav|archive-list|<svg/);
  assert.doesNotMatch(service, /watchPosition|localStorage|sessionStorage|fetch\(/);
  assert.match(service, /requestPermissions\(\['location'\]\)/);
});
