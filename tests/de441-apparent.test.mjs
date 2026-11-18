import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDe441Result} from '../src/app/native/de441-apparent.ts';

const ids=['Sun','Moon','Mercury','Venus','Mars barycenter','Jupiter barycenter','Saturn barycenter','Uranus barycenter','Neptune barycenter','Pluto barycenter'];
const values=() => ids.map(id=>({id,longitudeDeg:123,latitudeDeg:2,distanceAu:1,longitudeSpeedDegDay:-0.1,latitudeSpeedDegDay:0,distanceSpeedAuDay:0}));
test('accepts ten apparent positions without inferring houses',()=>{
  const result=decodeDe441Result({protocolVersion:1,status:'ok',packId:null,jdTdb:2451545,positions:values()});
  assert.equal(result.positions.length,10); assert.equal(result.positions[0].longitudeSpeedDegDay,-0.1);
});
test('preserves typed missing-pack errors and rejects incomplete or nonfinite results',()=>{
  assert.equal(decodeDe441Result({protocolVersion:1,status:'missing_pack',packId:'core',jdTdb:null,positions:[]}).packId,'core');
  assert.throws(()=>decodeDe441Result({protocolVersion:1,status:'ok',packId:null,jdTdb:2451545,positions:values().slice(1)}));
  const invalid=values(); invalid[0].longitudeDeg=NaN;
  assert.throws(()=>decodeDe441Result({protocolVersion:1,status:'ok',packId:null,jdTdb:2451545,positions:invalid}));
});
