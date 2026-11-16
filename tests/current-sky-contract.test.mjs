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
  assert.match(component, /attribution: 'Powered by VirgoStars'/);
  assert.doesNotMatch(html, /chart-illustration|bottom-nav|archive-list|<svg/);
  assert.doesNotMatch(service, /watchPosition|localStorage|sessionStorage|fetch\(/);
  assert.match(service, /requestPermissions\(\['location'\]\)/);
});

test('foreground lifecycle rejects stale GPS and native replies', () => {
  const service = text('src/app/current-sky/current-sky.service.ts');
  assert.match(service, /private lifecycleGeneration = 0/);
  assert.match(service, /const isActive = \(\): boolean/);
  assert.match(service, /if \(!isActive\(\)\) return;/);
  assert.match(service, /const capturedAt = new Date\(\);/);
  assert.match(service, /pendingForegroundRefresh/);
  assert.ok(service.indexOf('const capturedAt = new Date();') > service.indexOf('await getCurrentPosition('));
  assert.ok(service.indexOf('if (!isActive()) return;', service.indexOf("await invoke<CurrentSkySnapshot>")) > 0);
});

test('astronomy failures are not misreported as GPS failures', () => {
  const service = text('src/app/current-sky/current-sky.service.ts');
  assert.match(service, /this\.calculationStarted = true;\s*const snapshot = await invoke/);
  assert.match(service, /this\.calculationStarted \? 'failed' : 'location-unavailable'/);
  assert.match(service, /this\.calculationStarted = false;/);
});

test('refresh throttling advances only after a verified calculation', () => {
  const service = text('src/app/current-sky/current-sky.service.ts');
  const baselineAssignment = service.indexOf('this.baseline = { lastRequestAtMs: nowMs');
  const verification = service.indexOf('if (!this.isValidSnapshot(snapshot, input))');
  assert.ok(baselineAssignment > verification, 'failed calculations must remain retryable');
  assert.match(service, /this\.pendingForegroundRefresh = this\.inFlight/);
});

test('native snapshot verification rejects NaN observer coordinates and impossible aspects', () => {
  const service = text('src/app/current-sky/current-sky.service.ts');
  assert.match(service, /Number\.isFinite\(snapshot\.observer\.latitudeDeg\)/);
  assert.match(service, /Number\.isFinite\(snapshot\.observer\.longitudeDegEast\)/);
  assert.match(service, /snapshot\.observer\.altitudeMeters !== input\.altitudeMeters/);
  assert.match(service, /aspect\.firstBody !== aspect\.secondBody/);
  assert.match(service, /aspect\.exactAngleDeg <= 180/);
  assert.match(service, /aspect\.orbDeg <= 180/);
});
