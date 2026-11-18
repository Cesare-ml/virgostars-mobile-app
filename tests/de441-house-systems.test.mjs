import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateDe441Houses,makeDe441Chart} from '../src/app/astro/de441-house-systems.ts';
import {buildTemaRenderData} from '../src/app/astro/tema-render-data.ts';

// J2000: synthetic location, actual core house angles and apparent Sun from the
// independently executed real-DE441 native integration test; UT1 approximates UTC.
const angles={ut1JulianDay:2451545,ttJulianDay:2451545.0007428704,latitudeDeg:44.697805,longitudeDegEast:11.805778,
  armcDeg:292.2628498616511,ascendantDeg:39.75020785012371,midheavenDeg:290.58600954956177,
  trueObliquityDeg:23.437676824085482,vertexDeg:196.84768090769694,sunDeclinationDeg:-23.032430149254022};
const utc='2000-01-01T12:00:00Z';
test('exposes all 24 methods, keeps Sunshine and 36-sector Gauquelin distinct',async()=>{
  const methods=await calculateDe441Houses(utc,angles);
  assert.equal(methods.length,24);
  assert.equal(new Set(methods.map(m=>m.id)).size,24);
  const sun=methods.find(m=>m.id==='SUNSHINE'); assert.equal(sun.error,null); assert.equal(sun.values.length,12);
  const gauq=methods.find(m=>m.id==='GAUQUELIN_36'); assert.equal(gauq.error,null); assert.equal(gauq.kind,'sectors'); assert.equal(gauq.values.length,36);
  assert.ok(methods.filter(m=>m.kind==='houses'&&!m.error).length>=20);
});
test('unsupported geometry is reported rather than substituted',async()=>{
  const methods=await calculateDe441Houses(utc,{...angles,latitudeDeg:89.999,ascendantDeg:179.99904746938265,vertexDeg:204.04558450295326});
  assert.equal(methods.length,24);
  assert.ok(methods.some(m=>m.error));
  assert.ok(methods.filter(m=>m.error).every(m=>m.values.length===0));
});
test('chart adapter preserves returned cusps and keeps sectors separate',()=>{
  const position={id:'Sun',longitudeDeg:123,latitudeDeg:1,distanceAu:1,longitudeSpeedDegDay:1,latitudeSpeedDegDay:0,distanceSpeedAuDay:0,rightAscensionDeg:123,declinationDeg:1};
  const chart=makeDe441Chart({status:'ok',packId:null,jdTdb:2451545,positions:[position]},angles,[
    {id:'PLACIDUS',kind:'houses',error:null,values:Array.from({length:12},(_,i)=>i*30)},
    {id:'GAUQUELIN_36',kind:'sectors',error:null,values:Array.from({length:36},(_,i)=>i*10)},
    {id:'KOCH',kind:'houses',error:'UNAVAILABLE',values:[]},
  ]);
  assert.equal(chart.houses.length,1); assert.equal(chart.houses[0].id,'PLACIDUS');
  assert.equal(chart.houses[0].cuspsDeg[3],90); assert.deepEqual(chart.unavailableHouseSystems,['KOCH']);
});
test('real-source angles reach the renderer model for every twelve-cusp result',async()=>{
  const methods=await calculateDe441Houses(utc,angles);
  const ids=['Sun','Moon','Mercury','Venus','Mars barycenter','Jupiter barycenter','Saturn barycenter','Uranus barycenter','Neptune barycenter','Pluto barycenter'];
  const positions=ids.map((id,i)=>({id,longitudeDeg:i*20+1,latitudeDeg:1,distanceAu:1,longitudeSpeedDegDay:1,latitudeSpeedDegDay:0,distanceSpeedAuDay:0,rightAscensionDeg:i*20+1,declinationDeg:1}));
  const chart=makeDe441Chart({status:'ok',packId:null,jdTdb:2451545,positions},angles,methods);
  const data=buildTemaRenderData(chart,utc);
  assert.ok(data); assert.equal(Object.keys(data.houses).length,23);
  for (const method of methods.filter(m=>m.kind==='houses'&&!m.error)) {
    assert.deepEqual(data.houses[method.id].house,method.values);
  }
  assert.ok(!Object.hasOwn(data.houses,'GAUQUELIN_36'));
});
