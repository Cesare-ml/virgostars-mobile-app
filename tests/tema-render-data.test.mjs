import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableHouseSystems, buildTemaRenderData, formatDegreeInSign, planetRows,
} from '../src/app/astro/tema-render-data.ts';

// Visibly fictional snapshot: round numbers chosen to make the arithmetic obvious.
function body(id, longitudeDeg, extra = {}) {
  return {
    id, longitudeDeg, latitudeDeg: 2, distanceAu: 1, longitudeSpeed: 1, latitudeSpeed: 0.1,
    distanceSpeed: 0.01, rightAscensionDeg: 200, declinationDeg: -5, ephemerisSource: 'moshier', ...extra,
  };
}
function snapshot() {
  return {
    julianDayUt: 2451545,
    bodies: [
      body('Sun', 10), body('Moon', 45.5), body('Mars', 359, {longitudeSpeed: -0.2}),
      body('Uranus', 200), body('true Node', 100, {latitudeDeg: 0, declinationDeg: 12, rightAscensionDeg: 350}),
      body('osc. Apogee', 300, {latitudeDeg: -3}),
    ],
    houses: [
      {id: 'egizia', cuspsDeg: Array.from({length: 12}, (_, i) => (85 + i * 30) % 360),
        ascendantDeg: 100, mcDeg: 10, armcDeg: 11, vertexDeg: 220},
      {id: 'porfirio', cuspsDeg: Array.from({length: 12}, (_, i) => (100 + i * 30) % 360),
        ascendantDeg: 100, mcDeg: 10, armcDeg: 11, vertexDeg: 220},
    ],
    unavailableBodies: ['Chiron'],
    unavailableHouseSystems: ['placido', 'koch', 'regio-montano'],
  };
}

test('computed bodies keep their values and gain sign arithmetic', () => {
  const data = buildTemaRenderData(snapshot(), '2001-02-03T04:05:06Z');
  assert.equal(data.dataora, '2001-02-03T04:05:06Z');
  assert.deepEqual([data.as, data.ds, data.mc, data.ic], [100, 280, 10, 190]);
  const moon = data.planets.Moon;
  assert.equal(moon.longitude, 45.5);
  assert.equal(moon.longitudeSign, 1);
  assert.equal(moon.longitude30, 15.5);
  assert.deepEqual(moon.equatoriale, {rectAscension: 200, declination: -5});
  assert.equal(data.australInversion, false);
});

test('dodecatemoria exist only for the seven traditional bodies', () => {
  const data = buildTemaRenderData(snapshot(), '2001-02-03T04:05:06Z');
  assert.deepEqual(data.planets.Sun.dodecatemoria,
    {longitude: 130, longitudeSpeed: 1, longitudeSign: 4, longitude30: 10});
  assert.equal(data.planets.Uranus.dodecatemoria, undefined);
  assert.equal(data.planets['true Node'].dodecatemoria, undefined);
});

test('south node and perigee are exact opposites; nothing else is derived', () => {
  const data = buildTemaRenderData(snapshot(), '2001-02-03T04:05:06Z');
  const south = data.planets['true Node Sud'];
  assert.equal(south.longitude, 280);
  assert.equal(south.longitudeSign, 9);
  assert.equal(south.equatoriale.rectAscension, 170);
  assert.equal(south.equatoriale.declination, -12);
  assert.equal(data.planets['osc. Perigee'].longitude, 120);
  assert.equal(data.planets['osc. Perigee'].latitude, 3);
  // Not in the snapshot, so not in the chart: no placeholder positions.
  for (const absent of ['Chiron', 'mean Node', 'mean Node Sud', 'mean Perigee', 'Tyche', 'vertex']) {
    assert.equal(data.planets[absent], undefined, absent);
  }
});

test('only the house systems the provider returned are offered', () => {
  const data = buildTemaRenderData(snapshot(), '2001-02-03T04:05:06Z');
  assert.deepEqual(availableHouseSystems(data), ['egizia', 'porfirio']);
  assert.equal(data.houses.egizia.house.length, 12);
  assert.equal(data.houses.egizia.ds, 280);
  assert.equal(data.houses.egizia.ic, 190);
  assert.equal(data.houses.placido, undefined);
});

test('a snapshot without any house system yields no chart rather than a guessed ascendant', () => {
  assert.equal(buildTemaRenderData({...snapshot(), houses: []}, '2001-02-03T04:05:06Z'), null);
});

test('inspector rows report sign, house in the chosen system and retrograde motion', () => {
  const data = buildTemaRenderData(snapshot(), '2001-02-03T04:05:06Z');
  const egizia = Object.fromEntries(planetRows(data, 'egizia').map(row => [row.name, row]));
  // Egizia cusps start at 85: 10 deg falls in house 10 (355..25).
  assert.equal(egizia.Sun.house, 10);
  assert.equal(egizia.Mars.house, 10);
  assert.equal(egizia.Mars.retrograde, true);
  assert.equal(egizia.Sun.retrograde, false);
  assert.equal(egizia.Moon.signIndex, 1);
  const porfirio = Object.fromEntries(planetRows(data, 'porfirio').map(row => [row.name, row]));
  // Porfirio cusps start at 100: 10 deg falls in house 10 (10..40) exactly on the cusp.
  assert.equal(porfirio.Sun.house, 10);
  assert.equal(porfirio.Mars.house, 9);
  const missing = planetRows(data, 'placido');
  assert.ok(missing.every(row => row.house === null));
});

test('degrees within a sign are truncated to whole minutes', () => {
  assert.equal(formatDegreeInSign(0), "0°00'");
  assert.equal(formatDegreeInSign(15.5), "15°30'");
  assert.equal(formatDegreeInSign(29.9999), "29°59'");
  assert.equal(formatDegreeInSign(12.25), "12°15'");
});
