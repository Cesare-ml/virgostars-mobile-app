import test from 'node:test';
import assert from 'node:assert/strict';
import {chartInspectorRows} from '../src/app/astro/chart-inspector.ts';
const body=(id,longitudeDeg,longitudeSpeed)=>({id,longitudeDeg,longitudeSpeed,ephemerisSource:'moshier'});
const houses=[{id:'egizia',cuspsDeg:Array.from({length:12},(_,i)=>i*30)}, {id:'placido',cuspsDeg:Array.from({length:12},(_,i)=>(15+i*30)%360)}];
const chart={bodies:[body('Sun',10,1),body('Mars',359,-.1)],houses};
test('rows use selected house system and preserve calculated longitudes',()=>{
 const e=chartInspectorRows(chart,'egizia'), p=chartInspectorRows(chart,'placido');
 assert.deepEqual([e[0].signIndex,e[0].degree,e[0].house,e[0].longitude],[0,"10°00'",1,10]);
 assert.equal(p[0].house,12); assert.equal(e[1].retrograde,true); assert.equal(e[0].retrograde,false);
});
test('missing or invalid cusps never invent a house',()=>{
 assert.equal(chartInspectorRows(chart,null)[0].house,null);
 assert.equal(chartInspectorRows({...chart,houses:[{id:'egizia',cuspsDeg:[0]}]},'egizia')[0].house,null);
});
test('degree formatting does not cross a zodiac boundary',()=>{
 const row=chartInspectorRows({bodies:[body('Sun',29.999999999999996,1)],houses},'egizia')[0];
 assert.equal(row.signIndex,0); assert.equal(row.degree,"29°59'");
});