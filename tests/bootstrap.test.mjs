import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const text = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const config = JSON.parse(text('src-tauri/tauri.conf.json'));
const capabilities = JSON.parse(text('src-tauri/capabilities/default.json'));
const pkg = JSON.parse(text('package.json'));

test('Android-first app uses shared Tauri / Angular toolchain', () => {
  assert.equal(config.identifier, 'it.virgostars.mobile');
  assert.equal(config.bundle.android.minSdkVersion, 24);
  assert.equal(config.build.frontendDist, '../dist/virgostars-mobile/browser');
  assert.match(pkg.scripts['android:init'], /tauri android init/);
  assert.match(pkg.scripts['ios:init'], /tauri ios init/);
});

test('minimum native permission surface', () => {
  assert.deepEqual(capabilities.permissions, ['core:default']);
  assert.deepEqual(capabilities.windows, ['main']);
  assert.match(config.app.security.csp, /connect-src 'self'/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval/);
});

test('runtime bridge remains a non-privileged prototype command', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /fn runtime_info\(\)/);
  assert.match(rust, /schema_version: 1/);
  assert.doesNotMatch(rust, /reqwest|sqlx|http_client|password|secret|access_token/i);
});

test('current-sky screen calls native calculations and never renders a fake chart', () => {
  const ui = text('src/app/app.component.html');
  const component = text('src/app/app.component.ts');
  const rust = text('src-tauri/src/lib.rs');
  assert.match(component, /invoke<SkyChart>\('current_sky_chart'\)/);
  assert.match(component, /setInterval\(\(\) => void this\.refreshSky\(\), 60_000\)/);
  assert.match(ui, /sky\.positions/);
  assert.doesNotMatch(ui, /demoWarning|chart-illustration|placeholder chart/i);
  assert.match(component, /Powered by VirgoStars/);
  assert.match(rust, /astro::planet::geocent_apprnt_ecl_coords/);
  assert.match(rust, /astro::lunar::geocent_ecl_pos/);
  assert.match(rust, /VSOP87/);
  assert.match(rust, /ELP-2000\/82/);
  assert.match(rust, /TT_MINUS_UTC_SECONDS/);
  assert.equal(pkg.private, true);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
});

test('current-sky MVP does not request location or add account and network features', () => {
  const rust = text('src-tauri/src/lib.rs');
  const capabilitiesText = text('src-tauri/capabilities/default.json');
  const cargoFile = text('src-tauri/Cargo.toml');
  assert.match(rust, /No Ascendant, houses, observer coordinates, or location permission/);
  assert.doesNotMatch(rust, /reqwest|sqlite|sqlx|oauth|http_client/i);
  assert.doesNotMatch(capabilitiesText, /geolocation|location|http|filesystem|keychain/i);
  assert.match(cargoFile, /astro = "=2\.0\.0"/);
});
