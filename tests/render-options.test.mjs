import test from 'node:test';
import assert from 'node:assert/strict';
import {applyChartSettings} from '../src/app/astro/render-options.ts';
import {ASPECT_DEFINITIONS, AXIS_IDS, POINT_IDS, defaultChartSettings} from '../src/app/chart-settings.ts';

test('renderer receives configured aspects and only calculated points, with no invented bodies', () => {
  const options = {mostraAspetti: false, settaggi: {aspetti_attivi:{}, aspetti_orbite:{}, elementi_celesti:{
    Sun:{att:false, orb:0, aspVerso:false}, Moon:{att:true, orb:99, aspVerso:true},
    AS:{att:false, orb:0, aspVerso:false}, Tyche:{att:true, orb:1, aspVerso:true},
  }}};
  const settings = defaultChartSettings();
  settings.aspects.trigono.orb = 2;
  settings.points.Sun.orb = 4;
  applyChartSettings(options, {Sun:{}}, settings, {aspects:ASPECT_DEFINITIONS, axes:AXIS_IDS, points:POINT_IDS});
  assert.equal(options.mostraAspetti, true);
  assert.equal(options.settaggi.aspetti_attivi.trigono, true);
  assert.equal(options.settaggi.aspetti_orbite.trigono, 2);
  assert.deepEqual(options.settaggi.elementi_celesti.Sun, {att:true, orb:4, aspVerso:true});
  assert.equal(options.settaggi.elementi_celesti.Moon.att, false);
  assert.equal(options.settaggi.elementi_celesti.Moon.aspVerso, false);
  assert.equal(options.settaggi.elementi_celesti.AS.att, true);
  assert.equal(options.settaggi.elementi_celesti.Tyche.att, false);
});
