import test from 'node:test';
import assert from 'node:assert/strict';
import {aspectTable} from '../src/app/astro/aspect-table.ts';
import {ASPECT_DEFINITIONS, defaultChartSettings} from '../src/app/chart-settings.ts';

const chart = (sun, moon) => ({as:200, ds:20, mc:290, ic:110, planets:{
  Sun:{longitude:sun, equatoriale:{declination:12}}, Moon:{longitude:moon, equatoriale:{declination:12.5}}
}});
const find = (rows, from, to, aspect) => rows.find(r => r.from === from && r.to === to && r.aspect === aspect);

test('natal table uses the second point orb and excludes the boundary', () => {
  const s=defaultChartSettings();
  assert.equal(find(aspectTable(chart(0, 122), null, s, ASPECT_DEFINITIONS), 'Sun','Moon','trigono').orb, 2);
  s.points.Moon.orb=2;
  assert.equal(find(aspectTable(chart(0, 122), null, s, ASPECT_DEFINITIONS), 'Sun','Moon','trigono'), undefined);
});
test('cross comparisons preserve the chosen chart direction including identical points', () => {
  const s=defaultChartSettings();
  const rows=aspectTable(chart(359,120), chart(1,120), s, ASPECT_DEFINITIONS, 'SKY_TO_NATAL');
  assert.equal(find(rows,'Sun','Sun','congiunzione').orb,2);
  assert.ok(find(rows,'AS','AS','congiunzione'));
});
test('directed Phi wraps at zero and declination contacts use shared geometry', () => {
  const s=defaultChartSettings();
  s.aspects.philunare.active=true;
  s.aspects.parallelodideclinazione.active=true;
  const rows=aspectTable(chart(300,77.5), null, s, ASPECT_DEFINITIONS);
  assert.ok(find(rows,'Sun','Moon','philunare'));
  assert.equal(find(rows,'Sun','Moon','parallelodideclinazione').orb,0.5);
});
test('natal rows remain independent of the selected comparison and Phi keeps its direction', () => {
  const settings=defaultChartSettings();
  settings.aspects.philunare.active=true;
  const natal=chart(0,80), comparison=chart(137.5,80);
  const before=aspectTable(natal,null,settings,ASPECT_DEFINITIONS);
  const synastry=aspectTable(natal,comparison,settings,ASPECT_DEFINITIONS,'A_TO_B');
  const transits=aspectTable(comparison,natal,settings,ASPECT_DEFINITIONS,'SKY_TO_NATAL');
  assert.ok(find(synastry,'Sun','Sun','philunare'));
  assert.equal(find(transits,'Sun','Sun','philunare'),undefined);
  assert.deepEqual(aspectTable(natal,null,settings,ASPECT_DEFINITIONS),before);
  settings.showAspects=false;
  assert.deepEqual(aspectTable(natal,null,settings,ASPECT_DEFINITIONS),before);
});

function sourced(sun,moon,sunSpeed,moonSpeed) {
  const data=chart(sun,moon), utcIso='2000-01-01T12:00:00.000Z';
  data.dataora=utcIso; data.planets.Sun.longitudeSpeed=sunSpeed; data.planets.Moon.longitudeSpeed=moonSpeed;
  const bodies=[['Sun',sun,sunSpeed],['Moon',moon,moonSpeed]].map(([id,longitudeDeg,longitudeSpeed])=>({id,longitudeDeg,longitudeSpeed,ephemerisSource:'jpl'}));
  return {data,context:{utcIso,provider:{id:'virgostars_ephemeris',engineVersion:'core-0.1.0-6835e00'},chart:{julianDayUt:2451545,houseAngleFacts:{model:'iau2006_2000b_utc_as_ut1'},houses:[{ascendantDeg:200,mcDeg:290}],bodies}}};
}
test('applying and separating use the pinned provider rates and the closest oriented branch',()=>{
  const settings=defaultChartSettings();
  let sample=sourced(0,118,1,2);
  assert.equal(find(aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context),'Sun','Moon','trigono').trend,'applying');
  sample=sourced(0,118,1,-1);
  assert.equal(find(aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context),'Sun','Moon','trigono').trend,'separating');
  sample=sourced(359,241,1,0);
  assert.equal(find(aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context),'Sun','Moon','trigono').trend,'applying');
  sample=sourced(0,120,1,2);
  assert.equal(find(aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context),'Sun','Moon','trigono').trend,null);
});
test('transits hold the natal position fixed; synastry and uncertain provenance omit the mark',()=>{
  const settings=defaultChartSettings(), sky=sourced(118,10,1,0.5), natal=sourced(0,20,10,11);
  const transit=()=>aspectTable(sky.data,natal.data,settings,ASPECT_DEFINITIONS,'SKY_TO_NATAL',sky.context,natal.context);
  assert.equal(find(transit(),'Sun','Sun','trigono').trend,'applying');
  assert.equal(find(aspectTable(sky.data,natal.data,settings,ASPECT_DEFINITIONS,'A_TO_B',sky.context,natal.context),'Sun','Sun','trigono').trend,null);
  natal.context.provider.id='swiss_ephemeris';
  assert.equal(find(transit(),'Sun','Sun','trigono').trend,null);
  natal.context.provider.id='virgostars_ephemeris'; sky.context.chart.bodies[0].ephemerisSource='moshier';
  assert.equal(find(transit(),'Sun','Sun','trigono').trend,null);
  sky.context.chart.bodies[0].ephemerisSource='jpl'; sky.context.utcIso='2000-01-01T12:00:01.000Z';
  assert.equal(find(transit(),'Sun','Sun','trigono').trend,null);
});
test('modeled lunar points and their validated antipodes retain their shared rate',()=>{
  const settings=defaultChartSettings(), sample=sourced(0,118,1,2);
  sample.data.planets['true Node']={longitude:3,longitudeSpeed:-0.05,equatoriale:{declination:0}};
  sample.data.planets['true Node Sud']={longitude:183,longitudeSpeed:-0.05,equatoriale:{declination:0}};
  sample.context.chart.bodies.push({id:'true Node',longitudeDeg:3,longitudeSpeed:-0.05,ephemerisSource:'virgostars_model'});
  let rows=aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context);
  assert.equal(find(rows,'Sun','true Node','congiunzione').trend,'applying');
  assert.equal(find(rows,'Sun','true Node Sud','opposizione').trend,'applying');
  sample.data.planets['true Node Sud'].longitudeSpeed=3;
  rows=aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context);
  assert.equal(find(rows,'Sun','true Node Sud','opposizione').trend,null);
});
test('axis policy and directed Phi preserve explicit orientation',()=>{
  const settings=defaultChartSettings(); settings.aspects.phisolare.active=true;
  let sample=sourced(197,20,1,1.5);
  assert.equal(find(aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context),'Sun','AS','congiunzione').trend,'applying');
  sample=sourced(10,231.49,1,2);
  assert.equal(find(aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context),'Sun','Moon','phisolare').trend,'applying');
  const natal=sourced(200,20,1,2);
  const cross=aspectTable(sample.data,natal.data,settings,ASPECT_DEFINITIONS,'SKY_TO_NATAL',sample.context,natal.context);
  assert.equal(find(cross,'AS','Sun','congiunzione').trend,null);
  sample.data.ds=100;
  assert.equal(find(aspectTable(sample.data,null,settings,ASPECT_DEFINITIONS,'A_TO_B',sample.context),'Sun','Moon','phisolare').trend,null);
});
