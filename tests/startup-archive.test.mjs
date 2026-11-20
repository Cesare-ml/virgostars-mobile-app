import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STARTUP, STARTUP_KEY, loadStartup, saveStartup} from '../src/app/startup-preference.ts';
import {filterArchive} from '../src/app/archive-search.ts';

const id='11111111-1111-4111-8111-111111111111';
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),data};};
test('startup preference stores only a mode and a validated local archive ID',()=>{
  const s=storage();
  assert.equal(saveStartup(s,{mode:'natal-transits',chartId:id}),true);
  assert.deepEqual(loadStartup(s),{mode:'natal-transits',chartId:id});
  assert.deepEqual(JSON.parse(s.data.get(STARTUP_KEY)),{version:1,mode:'natal-transits',chartId:id});
  assert.equal(saveStartup(s,{mode:'natal-transits',chartId:null}),false);
  assert.equal(saveStartup(s,{mode:'sky',chartId:'not-a-uuid'}),false);
});
test('corrupt, future and inaccessible startup storage use safe defaults',()=>{
  const s=storage();
  for(const raw of ['{','{}',JSON.stringify({version:2,mode:'natal-transits',chartId:id}),'x'.repeat(257)]) {
    s.setItem(STARTUP_KEY,raw);assert.deepEqual(loadStartup(s),DEFAULT_STARTUP);
  }
  assert.deepEqual(loadStartup({getItem(){throw Error();}}),DEFAULT_STARTUP);
  assert.equal(saveStartup({setItem(){throw Error();}},{mode:'sky',chartId:null}),false);
});
test('archive search finds names and places ignoring accents and case without changing records',()=>{
  const charts=[{id:'a',name:'Élodie',placeName:'Torino'}, {id:'b',name:'Mario',placeName:'São Paulo'}];
  assert.deepEqual(filterArchive(charts,'elodie').map(x=>x.id),['a']);
  assert.deepEqual(filterArchive(charts,'SAO').map(x=>x.id),['b']);
  assert.deepEqual(filterArchive(charts,'zzz'),[]);
  assert.deepEqual(filterArchive(charts,' '),charts);
  assert.equal(charts[0].name,'Élodie');
});
