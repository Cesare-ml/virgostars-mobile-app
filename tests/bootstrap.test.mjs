import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const text = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const config = JSON.parse(text('src-tauri/tauri.conf.json'));
const capabilities = JSON.parse(text('src-tauri/capabilities/default.json'));
const pkg = JSON.parse(text('package.json'));

test('Android-first Tauri / Angular toolchain is retained', () => {
  assert.equal(config.identifier, 'it.virgostars.mobile');
  assert.equal(config.bundle.android.minSdkVersion, 24);
  assert.equal(config.build.frontendDist, '../dist/virgostars-mobile/browser');
  assert.match(pkg.scripts['android:init'], /tauri android init/);
  assert.match(pkg.scripts['android:build'], /tauri android build/);
});
test('minimum native permission surface remains unchanged', () => {
  assert.deepEqual(capabilities.permissions, ['core:default']);
  assert.deepEqual(capabilities.windows, ['main']);
  assert.match(config.app.security.csp, /connect-src 'self'/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval/);
});
test('native bridge remains read-only and non-privileged', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /fn runtime_info\(\)/);
  assert.match(rust, /schema_version: 1/);
  assert.doesNotMatch(rust, /reqwest|sqlx|http_client|password|secret|access_token/i);
});
test('live chart uses an astronomical provider and refreshes periodically', () => {
  const ui = text('src/app/app.component.html');
  const service = text('src/app/live-sky.service.ts');
  const component = text('src/app/app.component.ts');
  assert.match(ui, /chart-illustration/);
  assert.match(ui, /currentSky\.bodies/);
  assert.doesNotMatch(ui, /demoWarning|illustrative|geometric illustration/i);
  assert.match(service, /Astronomy\.GeoVector/);
  assert.match(service, /Astronomy\.Ecliptic/);
  assert.match(service, /GEOCENTRIC/);
  assert.match(service, /TROPICAL/);
  assert.match(component, /setInterval\(\(\) => \{/);
  assert.match(component, /\}, 30_000\)/);
  assert.match(component, /clearInterval/);
  assert.equal(pkg.dependencies['astronomy-engine'], '2.1.19');
  assert.equal(pkg.private, true);
});
test('attribution and provider boundary remain explicit', () => {
  const ui = text('src/app/app.component.html');
  const service = text('src/app/live-sky.service.ts');
  assert.match(ui, /Powered by VirgoStars/);
  assert.match(service, /ASTRONOMY_ENGINE_TEMPORARY/);
  assert.match(service, /No house cusps or Ascendant/);
  assert.ok(existsSync(new URL('../src/assets/virgostars-icon.svg', import.meta.url)));
});

test('foreground return refreshes live sky and error offers a retry', () => {
  const ui = text('src/app/app.component.html');
  const component = text('src/app/app.component.ts');
  assert.match(component, /visibilitychange/);
  assert.match(component, /document\.visibilityState === 'visible'/);
  assert.match(component, /window\.addEventListener\('focus'/);
  assert.match(component, /document\.removeEventListener\('visibilitychange'/);
  assert.match(component, /window\.removeEventListener\('focus'/);
  assert.match(ui, /\(click\)="refresh\(\)"/);
  assert.match(ui, /t\('retry'\)/);
});

test('zodiac dividers remain in the outer annulus and conjunctions wrap at 360 degrees', () => {
  const ui = text('src/app/app.component.html');
  const component = text('src/app/app.component.ts');
  assert.match(ui, /x1="160" y1="9" x2="160" y2="41" class="zodiac-divider"/);
  assert.match(component, /body\.longitude \+ 360 - bodies\[bodies\.length - 1\]\.longitude/);
  assert.match(component, /Math\.min\(gapFromPrevious, wrapGap\) < 11/);
});

test('ephemeris output must reject non-finite values before entering the chart', () => {
  const service = text('src/app/live-sky.service.ts');
  assert.match(service, /Number\.isFinite\(ecliptic\.elon\)/);
  assert.match(service, /Number\.isFinite\(ecliptic\.elat\)/);
  assert.match(service, /throw new RangeError/);
});

test('snapshot contract requires ten distinct bodies and valid ecliptic latitudes', () => {
  const service = text('src/app/live-sky.service.ts');
  assert.match(service, /Math\.abs\(ecliptic\.elat\) > 90/);
  assert.match(service, /bodies\.length !== 10/);
  assert.match(service, /new Set\(bodies\.map\(body => body\.id\)\)\.size !== 10/);
});
