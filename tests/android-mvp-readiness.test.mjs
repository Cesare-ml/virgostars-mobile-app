import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));

test('Android packaging points to the actual Angular browser output', () => {
  const angular = json('angular.json');
  const tauri = json('src-tauri/tauri.conf.json');
  const project = angular.projects['virgostars-mobile'];
  assert.equal(project.architect.build.builder, '@angular/build:application');
  assert.equal(project.architect.build.options.outputPath, 'dist/virgostars-mobile');
  assert.equal(tauri.build.frontendDist, '../dist/virgostars-mobile/browser');
  assert.equal(tauri.bundle.android.minSdkVersion, 24);
});

test('MVP boots directly into the live chart without permissions or login', () => {
  const component = read('src/app/app.component.ts');
  const html = read('src/app/app.component.html');
  const permissions = json('src-tauri/capabilities/default.json');
  assert.match(component, /ngOnInit\(\): void \{\s*this\.refreshSky\(\)/);
  assert.match(html, /chartMarkers\(\)/);
  assert.match(html, /positions\(\)/);
  assert.deepEqual(permissions.permissions, ['core:default']);
  assert.doesNotMatch(html, /<input|type="password"|sign.?in|login/i);
});

test('sky calculation remains local and has no external network dependency', () => {
  const engine = read('src/app/current-sky-engine.mjs');
  const view = read('src/app/current-sky-view.mjs');
  assert.doesNotMatch(engine + view, /\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
  assert.match(engine, /from 'astronomy-engine'/);
});

test('offline release build does not require Android location permissions', () => {
  const tauri = json('src-tauri/tauri.conf.json');
  const capabilities = json('src-tauri/capabilities/default.json');
  assert.equal(tauri.identifier, 'it.virgostars.mobile');
  assert.equal(capabilities.identifier, 'default');
  assert.doesNotMatch(JSON.stringify(capabilities), /geolocation|location|http:default/);
});

test('foreground and clock changes keep the current sky synchronized', () => {
  const component = read('src/app/app.component.ts');
  assert.match(component, /@HostListener\('document:visibilitychange'\)/);
  assert.match(component, /@HostListener\('window:pageshow'\)/);
  assert.match(component, /current\.getTime\(\) < previous\.getTime\(\)/);
  assert.match(component, /needsSkyRefresh\(this\.calculatedAt\(\), new Date\(\), CURRENT_SKY_REFRESH_MS\)/);
  assert.match(component, /if \(this\.clockTimer !== undefined\) clearInterval\(this\.clockTimer\)/);
  assert.match(component, /if \(this\.refreshTimer !== undefined\) clearInterval\(this\.refreshTimer\)/);
});

test('live chart exposes localized accessibility labels and semantic UTC time', () => {
  const html = read('src/app/app.component.html');
  assert.match(html, /\[attr\.aria-label\]="locale\(\) === 'it' \? 'Carta zodiacale del cielo attuale' : 'Current sky zodiac chart'"/);
  assert.match(html, /<time \[attr\.datetime\]="now\(\)\.toISOString\(\)"/);
  assert.match(html, /role="img"/);
  assert.match(html, /role="alert"/);
});
