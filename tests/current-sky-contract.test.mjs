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
  assert.match(source, /Math\.abs\(Date\.now\(\) - fix\.measuredAtMs\) > 45_000/);
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

test('native chart is checked for all ten tropical planetary positions before display', () => {
  const models = read('src/app/current-sky/current-sky.models.ts');
  const component = read('src/app/app.component.ts');
  assert.match(models, /export function parseSkyChart/);
  assert.match(models, /record\['zodiac'\] !== 'tropical'/);
  assert.match(models, /Number\.isFinite\(body\['longitude'\]\)/);
  assert.match(models, /bodies\.length !== allowed\.size/);
  assert.match(component, /parseSkyChart\(response\.chart\) === null/);
});

test('SVG wheel displays validated positions only after native ready response', () => {
  const html = read('src/app/app.component.html');
  const component = read('src/app/app.component.ts');
  const wheel = read('src/app/current-sky/sky-wheel.component.ts');
  assert.match(html, /<app-sky-wheel \[chart\]="sky"/);
  assert.match(component, /this\.chart\.set\(parsedChart\)/);
  assert.match(component, /this\.state\.set\('ready'\)/);
  assert.match(wheel, /this\.chart\(\)\.bodies/);
  assert.match(wheel, /radius \* Math\.sin\(radians\)/);
});

test('clustered planet glyphs retain precise zodiac longitude ticks', () => {
  const wheel = read('src/app/current-sky/sky-wheel.component.ts');
  assert.match(wheel, /point\(marker\.longitude, 107\)/);
  assert.match(wheel, /point\(marker\.longitude, 148\)/);
  assert.match(wheel, /Math\.min\(delta, 360 - delta\) < 12/);
  assert.match(wheel, /const radius = nearby\.length > 1/);
});
