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
  assert.match(pkg.scripts['android:build'], /tauri android build/);
});

test('native permission surface is foreground-only geolocation', () => {
  assert.deepEqual(capabilities.permissions, [
    'core:default',
    'geolocation:allow-check-permissions',
    'geolocation:allow-request-permissions',
    'geolocation:allow-get-current-position'
  ]);
  assert.deepEqual(capabilities.windows, ['main']);
  assert.match(config.app.security.csp, /connect-src 'self'/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval/);
});

test('native IPC has a typed current-sky command and no remote data dependencies', () => {
  const rust = text('src-tauri/src/lib.rs');
  const astro = text('src-tauri/src/current_sky.rs');
  assert.match(rust, /current_sky::calculate_current_sky/);
  assert.match(astro, /pub trait CurrentSkyProvider/);
  assert.match(astro, /ephemeris_provider_not_configured/);
  assert.doesNotMatch(rust + astro, /reqwest|sqlx|http_client|access_token/i);
});

test('single-purpose UI contains no demo chart or unrelated feature navigation', () => {
  const ui = text('src/app/app.component.html');
  assert.doesNotMatch(ui, /chart-illustration|demoWarning|bottom-nav|archive|settings/);
  assert.match(ui, /Powered by VirgoStars|t\('powered'\)/);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
  assert.equal(pkg.private, true);
});
