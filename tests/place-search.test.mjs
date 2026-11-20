import test from 'node:test';
import assert from 'node:assert/strict';
import {countryLabel,placeLabel,normalizePlaceQuery} from '../src/app/astro/place-search.ts';
import {decodeOfflinePlaceResults,OfflinePlaceSearch} from '../src/app/native/offline-places-contract.ts';
const row={id:1,name:'Example',italianName:null,latMicro:1000000,lngMicro:2000000,population:null,stateId:1,region:'Region',timeZone:'UTC',countryName:'Italy',countryCode:'IT'};
test('native results are bounded and validated',()=>{
  assert.equal(decodeOfflinePlaceResults({protocolVersion:1,items:[row]})[0].name,'Example');
  assert.throws(()=>decodeOfflinePlaceResults({protocolVersion:1,items:[{...row,latMicro:90000001}]}));
  assert.throws(()=>decodeOfflinePlaceResults({protocolVersion:1,items:[row,row]}));
  assert.throws(()=>decodeOfflinePlaceResults({protocolVersion:1,items:Array(31).fill(row)}));
});
test('search does not use a web fallback and ignores stale replies',async()=>{
  const offline=new OfflinePlaceSearch({isNative:()=>false,invoke:async()=>{throw Error('not called')}});
  assert.equal((await offline.search('Example')).kind,'not_native');
  let resolve; const search=new OfflinePlaceSearch({isNative:()=>true,invoke:()=>new Promise(r=>resolve=r)});
  const pending=search.search('Example');search.clear();resolve({protocolVersion:1,items:[row]});
  assert.equal((await pending).kind,'stale');
});
test('place labels and country display handle missing codes',()=>{
  assert.equal(countryLabel('IT','it'),'Italia'); assert.equal(countryLabel('IT','en'),'Italy');
  assert.equal(normalizePlaceQuery('Landriano, Italia'),'Landriano, IT');
  assert.equal(normalizePlaceQuery('Landriano, Lombardia, Italy'),'Landriano, Lombardia, IT');
  assert.equal(placeLabel({name:'Example',country:'',countryName:'Italy'}),'Example, Italy');
});
