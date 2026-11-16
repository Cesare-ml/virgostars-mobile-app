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

test('native permission surface is narrow and location requires user consent', () => {
  assert.deepEqual(capabilities.windows, ['main']);
  assert.ok(capabilities.permissions.includes('core:default'));
  assert.ok(capabilities.permissions.includes('geolocation:allow-check-permissions'));
  assert.ok(capabilities.permissions.includes('geolocation:allow-request-permissions'));
  assert.ok(capabilities.permissions.includes('geolocation:allow-get-current-position'));
  assert.equal(capabilities.permissions.includes('geolocation:allow-watch-position'), false);
  assert.match(config.app.security.csp, /connect-src 'self'/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval/);
});

test('native commands expose runtime info and the official geolocation plugin only', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /fn runtime_info\(\)/);
  assert.match(rust, /schema_version: 1/);
  assert.match(rust, /tauri_plugin_geolocation::init\(\)/);
  assert.doesNotMatch(rust, /reqwest|sqlx|http_client|password|secret|access_token/i);
});

test('live chart uses the pinned temporary provider and native location flow', () => {
  const ui = text('src/app/app.component.html');
  const app = text('src/app/app.component.ts');
  const service = text('src/app/sky-chart.service.ts');
  const math = text('src/app/sky-chart-math.js');
  assert.match(ui, /Powered by VirgoStars/);
  assert.match(ui, /Posizioni planetarie/);
  assert.match(app, /checkPermissions/);
  assert.match(app, /requestPermissions\(\['location'\]\)/);
  assert.match(app, /getCurrentPosition/);
  assert.match(app, /30_000/);
  assert.match(service, /Astronomy\.GeoVector/);
  assert.match(service, /Astronomy\.Ecliptic/);
  assert.match(service, /Astronomy\.Rotation_EQD_ECT/);
  assert.match(service, /calculateAscendant\(/);
  assert.match(math, /eastProjectionAt/);
  assert.match(app, /formatDegreeMinute/);
  assert.match(app, /refreshChart\(\)/);
  assert.equal(pkg.dependencies['astronomy-engine'], '2.1.19');
  assert.equal(pkg.dependencies['@tauri-apps/plugin-geolocation'], '2.5.0');
  assert.equal(pkg.private, true);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
});
