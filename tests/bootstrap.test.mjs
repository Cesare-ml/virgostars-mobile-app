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

test('archive registration and the platform key store are restricted to Android', () => {
  const rust = text('src-tauri/src/lib.rs');
  for (const module of ['archive_keys', 'archive_vault', 'chart_archive']) {
    assert.match(rust, new RegExp('#\\[cfg\\(any\\(all\\(test, feature = "archive-experimental"\\), all\\(target_os = "android", feature = "archive-mobile"\\)\\)\\)\\]\\s*mod ' + module));
  }
  assert.match(rust, /generate_handler!\[runtime_info, chart_calculation::calculate_chart/);
  assert.match(rust, /all\(target_os = "android", feature = "archive-mobile"\)/);
  assert.match(rust, /android_archive::chart_archive/);
  assert.doesNotMatch(rust, /generate_handler!\[[^\]]*remove_legacy/s);
});

test('native command only reports public runtime information', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /fn runtime_info\(\)/);
  assert.match(rust, /schema_version: 1/);
  assert.doesNotMatch(rust, /reqwest|sqlx|http_client|password|secret|access_token/i);
});

test('no fake astrology results or private data bundled', () => {
  const ui = text('src/app/app.component.html');
  assert.doesNotMatch(ui, /Benvenuto in VirgoStars|Pensato per l’offline|Prototipo Android/);
  assert.doesNotMatch(ui, /Powered by VirgoStars|virgostars\.it/);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
  assert.equal(pkg.private, true);
});
