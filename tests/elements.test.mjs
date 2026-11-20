import test from 'node:test';
import assert from 'node:assert/strict';
import {chartElements} from '../src/app/astro/elements.ts';
test('groups the ten major planets by zodiac element and ignores other points',()=>{
  const chart={bodies:[{id:'Sun',longitudeDeg:0},{id:'Moon',longitudeDeg:30},{id:'Mars',longitudeDeg:60},{id:'Venus',longitudeDeg:90},{id:'Pluto',longitudeDeg:359.9},{id:'mean Node',longitudeDeg:15}]};
  assert.deepEqual(chartElements(chart),[{id:'fire',points:['Sun']},{id:'earth',points:['Moon']},{id:'air',points:['Mars']},{id:'water',points:['Venus','Pluto']}]);
});
