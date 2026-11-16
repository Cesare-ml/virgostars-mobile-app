import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('MVP opens directly on the current-sky experience and contains no fake chart', () => {
  const html = read('src/app/app.component.html');
  const component = read('src/app/app.component.ts');
  assert.match(html, /t\('title'\)/);
  assert.match(component, /refreshCurrentSky\(\)/);
  assert.doesNotMatch(html, /chart-illustration|demoWarning|bottom-nav|archive|settings/);
});

test('frontend requests foreground location and delegates calculation to native IPC', () => {
  const source = read('src/app/current-sky/native-current-sky.ts');
  assert.match(source, /checkPermissions/);
  assert.match(source, /requestPermissions\(\['location'\]\)/);
  assert.match(source, /getCurrentPosition/);
  assert.match(source, /calculate_current_sky/);
  assert.doesNotMatch(source, /watchPosition|background/i);
});

test('refreshes on foreground return and has a bounded minute refresh after chart computation', () => {
  const source = read('src/app/app.component.ts');
  assert.match(source, /document:visibilitychange/);
  assert.match(source, /60_000/);
  assert.match(source, /Math\.abs\(Date\.now\(\) - fix\.measuredAtMs\) > 45_000/);
});

test('native calculation fails closed until a real provider is registered', () => {
  const source = read('src-tauri/src/current_sky.rs');
  assert.match(source, /trait CurrentSkyProvider/);
  assert.match(source, /ephemeris_provider_not_configured/);
  assert.match(source, /chart: None/);
  assert.match(source, /invalid_input/);
});

test('no Swiss code or binary is bundled without a verified license decision', () => {
  const cargo = read('src-tauri/Cargo.toml');
  assert.doesNotMatch(cargo, /swisseph|sweph/i);
});
