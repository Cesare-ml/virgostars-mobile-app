import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleSharedHouses} from '../src/app/astro/shared-house-adapter.ts';

const provider={id:'virgostars_ephemeris',engineVersion:'core-0.1.0-6835e00'};
const request={utcIso:'2000-01-01T12:00:00.000Z',latMicro:0,lngMicro:0};
const fixture=()=>({julianDayUt:2451545,bodies:[],houses:[],unavailableBodies:[],
  unavailableHouseSystems:['egizia','placido','koch','regio-montano','porfirio'],
  houseAngleFacts:{model:'iau2006_2000b_utc_as_ut1',timeSource:'iers_leap_seconds',ttJulianDay:2451545.00074,
    latitudeDeg:0,longitudeDegEast:0,armcDeg:270,trueObliquityDeg:23.439,ascendantDeg:0,mcDeg:270,vertexDeg:180}});

test('shared house methods assemble each system from explicit native angles',()=>{
  const input=fixture(), result=assembleSharedHouses(input,provider,request);
  assert.deepEqual(result.houses.map(h=>h.id),['egizia','placido','koch','regio-montano','porfirio']);
  assert.deepEqual(result.unavailableHouseSystems,[]);
  assert.equal(result.houses[0].cuspsDeg[0],345);
  assert.ok(result.houses.every(h=>h.cuspsDeg.length===12 && h.ascendantDeg===0 && h.mcDeg===270));
  assert.ok(Object.isFrozen(result.houses) && Object.isFrozen(result.houses[0].cuspsDeg));
  assert.equal(input.houses.length,0);
});
test('polar or inconsistent systems are reported unavailable without substitution',()=>{
  const input=fixture(); input.houseAngleFacts.latitudeDeg=75;
  const result=assembleSharedHouses(input,provider,{...request,latMicro:75_000_000});
  assert.ok(result.unavailableHouseSystems.includes('placido'));
  assert.ok(result.unavailableHouseSystems.includes('koch'));
  assert.equal(result.houses.some(h=>h.id==='placido' || h.id==='koch'),false);
  assert.equal(result.houses.length+result.unavailableHouseSystems.length,5);
});
test('mismatched provider, position, time or preassembled native houses fail closed',()=>{
  for (const [chart, info, input] of [
    [fixture(),{...provider,engineVersion:'wrong'},request],
    [fixture(),{...provider,id:'swiss_ephemeris'},request],
    [fixture(),provider,{...request,latMicro:1}],
    [fixture(),provider,{...request,utcIso:'2000-01-01T12:00:01.000Z'}],
    [{...fixture(),houses:[{id:'egizia'}]},provider,request],
  ]) assert.throws(()=>assembleSharedHouses(chart,info,input),{message:'Incompatible house-angle facts'});
});
