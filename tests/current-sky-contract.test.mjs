import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('current sky contract contains explicit time, observer and provider provenance', () => {
  const contract = text('src/app/current-sky/contracts.ts');
  for (const field of ['capturedAtUtc', 'timezoneId', 'utcOffsetMinutes', 'latitudeDeg', 'longitudeDegEast', 'locationAccuracyMeters', 'provider', 'timeScale', 'coordinateFrame', 'houseCusps', 'aspects']) {
    assert.match(contract, new RegExp(field));
  }
});

test('native bridge fails closed until an actual engine is linked', () => {
  const rust = text('src-tauri/src/lib.rs');
  assert.match(rust, /calculate_current_sky/);
  assert.match(rust, /sky_engine_unavailable/);
  assert.doesNotMatch(rust, /positions:\s*vec!|house_cusps:\s*vec!/);
});

test('live app has one initial screen and no placeholder wheel or archive features', () => {
  const component = text('src/app/app.component.html');
  assert.match(component, /Il cielo di adesso/);
  assert.doesNotMatch(component, /chart-illustration|bottom-nav|archive-list/);
  assert.match(component, /Powered by VirgoStars/);
});
