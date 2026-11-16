import test from 'node:test';
import assert from 'node:assert/strict';
import {nextPlanetSelection} from '../src/app/astro/planet-selection.ts';
const bodies=[{id:'Sun'},{id:'Moon'}];
test('only computed bodies can be selected and the active body toggles off',()=>{
 assert.equal(nextPlanetSelection(bodies,null,'Sun'),'Sun');
 assert.equal(nextPlanetSelection(bodies,'Sun','Moon'),'Moon');
 assert.equal(nextPlanetSelection(bodies,'Sun','Sun'),null);
 assert.equal(nextPlanetSelection(bodies,'Sun','Chiron'),'Sun');
 assert.equal(nextPlanetSelection([],null,'Sun'),null);
});