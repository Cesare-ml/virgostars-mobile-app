import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const text = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const config = JSON.parse(text('src-tauri/tauri.conf.json'));
const capabilities = JSON.parse(text('src-tauri/capabilities/default.json'));
const pkg = JSON.parse(text('package.json'));

test('Android-first app uses the Tauri / Angular toolchain', () => {
  assert.equal(config.identifier, 'it.virgostars.mobile');
  assert.equal(config.bundle.android.minSdkVersion, 24);
  assert.equal(config.build.frontendDist, '../dist/virgostars-mobile/browser');
  assert.match(pkg.scripts['android:init'], /tauri android init/);
  assert.match(pkg.scripts['ios:init'], /tauri ios init/);
});

test('native permissions are limited to foreground one-shot location', () => {
  assert.ok(capabilities.permissions.includes('core:default'));
  assert.ok(capabilities.permissions.includes('geolocation:allow-check-permissions'));
  assert.ok(capabilities.permissions.includes('geolocation:allow-request-permissions'));
  assert.ok(capabilities.permissions.includes('geolocation:allow-get-current-position'));
  assert.ok(!capabilities.permissions.includes('geolocation:allow-watch-position'));
  assert.deepEqual(capabilities.windows, ['main']);
  assert.match(config.app.security.csp, /connect-src 'self'/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval/);
});

test('native runtime bridge remains non-privileged', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /fn runtime_info\(\)/);
  assert.match(rust, /schema_version: 1/);
  assert.doesNotMatch(rust, /reqwest|sqlx|http_client|password|secret|access_token/i);
});

test('MVP opens directly on live sky and never draws a fictitious chart', () => {
  const ui = text('src/app/app.component.html');
  const component = text('src/app/app.component.ts');
  assert.match(ui, /chartPending/);
  assert.match(ui, /Powered by VirgoStars|powered/);
  assert.doesNotMatch(ui, /chart-illustration|archive-list|bottom-nav/);
  assert.match(component, /readLiveSkySnapshot/);
  assert.match(component, /60_000/);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
});

test('Swiss Ephemeris is not bundled without an explicit licensing gate', () => {
  const cargo = text('src-tauri/Cargo.toml');
  const packageText = text('package.json');
  assert.doesNotMatch(cargo, /sweph|swisseph/i);
  assert.doesNotMatch(packageText, /sweph|swisseph/i);
});
