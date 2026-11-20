import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultUiPreferences, UI_PREFERENCES_KEY, loadUiPreferences, saveUiPreferences,deviceLocale} from '../src/app/ui-preferences.ts';

const storage = initial => {let value = initial; return {getItem:k => {assert.equal(k,UI_PREFERENCES_KEY);return value;},setItem:(k,v) => {assert.equal(k,UI_PREFERENCES_KEY);value=v;},raw:()=>value};};
test('appearance and language round trip without retaining unrelated personal data', () => {
  const store=storage(null);
  assert.deepEqual(loadUiPreferences(store), defaultUiPreferences());
  assert.equal(saveUiPreferences(store,{theme:'light',locale:'en',name:'fictional private data'}),true);
  assert.deepEqual(JSON.parse(store.raw()),{version:1,theme:'light',locale:'en'});
  assert.deepEqual(loadUiPreferences(store),{theme:'light',locale:'en'});
});
test('corrupt, oversized, unsupported or unavailable storage falls back safely', () => {
  for (const value of ['invalid','null','[]','x'.repeat(513),'{"version":2,"theme":"light"}']) assert.deepEqual(loadUiPreferences(storage(value)),defaultUiPreferences());
  assert.deepEqual(loadUiPreferences(storage('{"version":1,"theme":"light","locale":"invalid"}')),{theme:'light',locale:deviceLocale()});
  const broken={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  assert.deepEqual(loadUiPreferences(broken),defaultUiPreferences());
  assert.equal(saveUiPreferences(broken,{theme:'light',locale:'en'}),false);
  assert.equal(saveUiPreferences(storage(null),{theme:'invalid',locale:'en'}),false);
});
test('device language uses Italian when supported, otherwise English',()=>{
  assert.equal(deviceLocale('it-IT'),'it');assert.equal(deviceLocale('IT_ch'),'it');
  assert.equal(deviceLocale('fr-FR'),'en');assert.equal(deviceLocale(null),'en');
});
