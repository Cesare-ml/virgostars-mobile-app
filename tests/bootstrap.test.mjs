import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const text = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const config = JSON.parse(text('src-tauri/tauri.conf.json'));
const capabilities = JSON.parse(text('src-tauri/capabilities/default.json'));
const pkg = JSON.parse(text('package.json'));

test('Android-first app uses the supported Tauri / Angular toolchain', () => {
  assert.equal(config.identifier, 'it.virgostars.mobile');
  assert.equal(config.bundle.android.minSdkVersion, 24);
  assert.equal(config.build.frontendDist, '../dist/virgostars-mobile/browser');
  assert.match(pkg.scripts['android:init'], /tauri android init/);
  assert.match(pkg.scripts['android:dev'], /tauri android dev/);
  assert.match(pkg.scripts['android:build'], /tauri android build/);
});

test('native capabilities grant only foreground one-shot geolocation', () => {
  assert.deepEqual(capabilities.windows, ['main']);
  assert.deepEqual(new Set(capabilities.permissions), new Set([
    'core:default',
    'geolocation:allow-check-permissions',
    'geolocation:allow-request-permissions',
    'geolocation:allow-get-current-position'
  ]));
  assert.equal(capabilities.permissions.some((permission) => permission.includes('watch')), false);
  assert.match(config.app.security.csp, /connect-src 'self'/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval/);
});

test('native bridge exposes a typed live-sky command without network or storage', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /fn runtime_info\(\)/);
  assert.match(rust, /fn calculate_current_sky\(/);
  assert.match(rust, /sky_engine_unavailable/);
  assert.doesNotMatch(rust, /reqwest|sqlx|http_client|password|secret|access_token/i);
});

test('initial experience is the current sky and never a fake chart', () => {
  const ui = text('src/app/app.component.html');
  assert.match(ui, /Il cielo di adesso/);
  assert.match(ui, /Powered by VirgoStars/);
  assert.doesNotMatch(ui, /chart-illustration|<svg/);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
  assert.equal(pkg.private, true);
});
