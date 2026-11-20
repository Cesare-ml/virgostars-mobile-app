import test from 'node:test';import assert from 'node:assert/strict';
import {filterSettings,SETTINGS_ENTRIES} from '../src/app/settings-menu.ts';
test('settings search matches names, translations and keywords without changing order',()=>{
  assert.deepEqual(filterSettings('domificaz').map(x=>x.id),['houses']);
  assert.deepEqual(filterSettings('chiron').map(x=>x.id),['chiron']);
  assert.deepEqual(filterSettings('deltat').map(x=>x.id),['usno']);
  assert.equal(filterSettings('nessun risultato').length,0);
  assert.equal(filterSettings('').length,SETTINGS_ENTRIES.length);
});
