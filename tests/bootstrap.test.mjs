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

test('native command only reports public runtime information', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /fn runtime_info\(\)/);
  assert.match(rust, /schema_version: 1/);
  assert.doesNotMatch(rust, /reqwest|sqlx|http_client|password|secret|access_token/i);
});

test('live planetary chart replaces the old illustrative shell', () => {
  const ui = text('src/app/app.component.html');
  const engine = text('src/app/current-sky-engine.mjs');
  assert.doesNotMatch(ui, /demoWarning|chart-illustration|demo-warning/);
  assert.match(ui, /Powered by VirgoStars/);
  assert.match(engine, /GeoVector/);
  assert.match(engine, /EclipticGeoMoon/);
  assert.match(engine, /ECLIPTIC_OF_DATE/);
  assert.match(pkg.dependencies['astronomy-engine'], /^2\.1\.19$/);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
  assert.equal(pkg.private, true);
});
