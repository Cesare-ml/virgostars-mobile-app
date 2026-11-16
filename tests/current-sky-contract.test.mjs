import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('MVP opens directly on the current-sky experience and contains no fake chart', () => {
  const html = read('src/app/app.component.html');
  const component = read('src/app/app.component.ts');
  assert.match(html, /t\('title'\)/);
  assert.match(component, /refreshCurrentSky\(\)/);
  assert.doesNotMatch(html, /chart-illustration|demoWarning|bottom-nav|archive|settings/);
});

test('frontend requests foreground location and delegates calculation to native IPC', () => {
  const source = read('src/app/current-sky/native-current-sky.ts');
  assert.match(source, /checkPermissions/);
  assert.match(source, /requestPermissions\(\['location'\]\)/);
  assert.match(source, /getCurrentPosition/);
  assert.match(source, /calculate_current_sky/);
  assert.doesNotMatch(source, /watchPosition|ACCESS_BACKGROUND_LOCATION/i);
});

test('refreshes on foreground return and has a bounded minute refresh after provider response', () => {
  const source = read('src/app/app.component.ts');
  assert.match(source, /document:visibilitychange/);
  assert.match(source, /60_000/);
  assert.match(source, /fix\.measuredAtMs > nowMs \+ 2_000/);
  assert.match(source, /nowMs - fix\.measuredAtMs > 45_000/);
  assert.match(source, /if \(document\.visibilityState === 'visible'\) this\.startRefreshTimer\(\)/);
  assert.doesNotMatch(source, /if \(this\.state\(\) === 'renderer-unavailable'\) this\.startRefreshTimer\(\)/);
});

test('native calculation fails closed until a real provider is registered', () => {
  const source = read('src-tauri/src/current_sky.rs');
  assert.match(source, /trait CurrentSkyProvider/);
  assert.match(source, /ephemeris_provider_not_configured/);
  assert.match(source, /chart: None/);
  assert.match(source, /invalid_input/);
});

test('no Swiss code or binary is bundled without a verified license decision', () => {
  const cargo = read('src-tauri/Cargo.toml');
  assert.doesNotMatch(cargo, /swisseph|sweph/i);
});

test('native request rejects malformed instants and invalid IANA timezones', () => {
  const source = read('src-tauri/src/current_sky.rs');
  const cargo = read('src-tauri/Cargo.toml');
  assert.match(source, /valid_utc_instant\(&request\.instant_utc\)/);
  assert.match(source, /valid_iana_timezone\(&request\.timezone_id\)/);
  assert.match(source, /parse_from_rfc3339/);
  assert.match(source, /malformed_and_offset_instants_are_rejected/);
  assert.match(source, /invalid_timezone_is_rejected/);
  assert.match(cargo, /chrono-tz/);
});

test('backgrounded and destroyed screens discard pending asynchronous results', () => {
  const source = read('src/app/app.component.ts');
  assert.match(source, /private refreshGeneration = 0/);
  assert.match(source, /generation !== this\.refreshGeneration/);
  assert.match(source, /this\.destroyed = true/);
  assert.match(source, /this\.refreshGeneration\+\+/);
});

test('current sky uses clock time rather than GPS acquisition timestamp', () => {
  const source = read('src/app/app.component.ts');
  assert.match(source, /const nowMs = Date\.now\(\)/);
  assert.match(source, /instantUtc: new Date\(nowMs\)\.toISOString\(\)/);
  assert.doesNotMatch(source, /instantUtc: new Date\(fix\.measuredAtMs\)/);
});

test('backgrounding clears potentially stale chart and location metadata', () => {
  const source = read('src/app/app.component.ts');
  const visibilityHandler = source.split("onVisibilityChange(): void")[1].split("ngOnDestroy(): void")[0];
  assert.match(visibilityHandler, /this\.response\.set\(null\)/);
  assert.match(visibilityHandler, /this\.request\.set\(null\)/);
  assert.match(visibilityHandler, /this\.state\.set\('loading'\)/);
});

test('native provider boundary rejects invalid chart payloads and frontend uses typed DTO', () => {
  const rust = read('src-tauri/src/current_sky.rs');
  const models = read('src/app/current-sky/current-sky.models.ts');
  assert.match(rust, /struct ChartPayload/);
  assert.match(rust, /chart\.is_valid\(\)/);
  assert.match(rust, /malformed_provider_chart_is_rejected/);
  assert.match(models, /interface ChartPayload/);
  assert.match(models, /chart: ChartPayload \| null/);
});
