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

test('launch screen renders a live geocentric sky chart, not a placeholder', () => {
  const ui = text('src/app/app.component.html');
  const app = text('src/app/app.component.ts');
  const service = text('src/app/current-sky.service.ts');
  assert.match(ui, /Tema del cielo attuale/);
  assert.match(ui, /Powered by VirgoStars/);
  assert.doesNotMatch(ui, /demoWarning|Illustrazione geometrica/);
  assert.match(app, /setInterval\(\(\) => this\.refresh\(\), 30_000\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /stopRefreshTimer/);
  assert.match(service, /GeoVector\(item\.body, instant, true\)/);
  assert.match(service, /Rotation_EQJ_ECT\(instant\)/);
  assert.match(service, /RotateVector\(frame, vector\)/);
  assert.match(service, /every\(Number\.isFinite\)/);
  assert.match(service, /remainder < 0/);
  assert.equal(pkg.dependencies['astronomy-engine'], '2.1.19');
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
});

test('temporary astronomy dependency keeps its own MIT notice', () => {
  const notice = text('NOTICE');
  assert.match(notice, /Astronomy Engine 2\.1\.19/);
  assert.match(notice, /THIRD_PARTY_LICENSES\/ASTRONOMY_ENGINE_MIT\.txt/);
  assert.ok(existsSync(new URL('../THIRD_PARTY_LICENSES/ASTRONOMY_ENGINE_MIT.txt', import.meta.url)));
});

test('calculation is not presented as a location-specific natal chart', () => {
  const ui = text('src/app/app.component.html');
  const docs = text('docs/CURRENT_SKY_MVP.md');
  assert.match(ui, /non mostra Ascendente né case/);
  assert.match(docs, /geocentrica/);
  assert.match(docs, /Ascendente, MC e case/);
});
