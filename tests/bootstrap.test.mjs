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

test('the home screen opens directly on the live chart', () => {
  const ui = text('src/app/app.component.html');
  const ts = text('src/app/app.component.ts');
  assert.match(ui, /CIELO IN TEMPO REALE|LIVE SKY/);
  assert.match(ui, /Powered by VirgoStars/);
  assert.doesNotMatch(ui, /demoWarning|chart-illustration|bottom-nav/);
  assert.match(ts, /calculateCurrentSky/);
  assert.match(ts, /60_000/);
  assert.ok(existsSync(new URL('../src/app/current-sky.mjs', import.meta.url)));
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
  assert.equal(pkg.dependencies['astronomy-engine'], '2.1.19');
  assert.equal(pkg.private, true);
});

test('no account, personal birth data or network feature is added to the MVP', () => {
  const ts = text('src/app/app.component.ts');
  const rust = text('src-tauri/src/lib.rs');
  assert.doesNotMatch(ts, /localStorage|sessionStorage|fetch\(/);
  assert.match(rust, /fn runtime_info\(\)/);
  assert.doesNotMatch(rust, /reqwest|sqlx|password|secret|access_token/i);
});
