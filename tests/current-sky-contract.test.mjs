import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('current-sky UI has one destination and no illustrative chart', () => {
  const html = read('src/app/app.component.html');
  assert.match(html, /current-sky/);
  assert.doesNotMatch(html, /chart-illustration|demoWarning|archive|settings/);
});

test('frontend requests foreground location and delegates calculation to native IPC', () => {
  const source = read('src/app/current-sky/native-current-sky.ts');
  assert.match(source, /checkPermissions/);
  assert.match(source, /requestPermissions\(\['location'\]\)/);
  assert.match(source, /getCurrentPosition/);
  assert.match(source, /calculate_current_sky/);
  assert.doesNotMatch(source, /watchPosition|background/i);
});

test('native calculation fails closed until a real provider is registered', () => {
  const source = read('src-tauri/src/current_sky.rs');
  assert.match(source, /trait CurrentSkyProvider/);
  assert.match(source, /ephemeris_provider_not_configured/);
  assert.match(source, /chart: None/);
  assert.match(source, /invalid_input/);
});

test('no astronomy implementation or Swiss binary is bundled in this slice', () => {
  const source = read('src-tauri/Cargo.toml');
  assert.doesNotMatch(source, /swisseph|sweph/i);
});
