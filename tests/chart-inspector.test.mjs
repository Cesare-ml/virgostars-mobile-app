import test from 'node:test';
import assert from 'node:assert/strict';
import {chartInspectorAxes, chartInspectorRows} from '../src/app/astro/chart-inspector.ts';
import {pointLabel} from '../src/app/astro/point-labels.ts';
import {CHART_BODY_IDS} from '../src/app/native/chart-calculation-contract.ts';
import {POINT_IDS} from '../src/app/chart-settings.ts';
const body=(id,longitudeDeg,longitudeSpeed)=>({id,longitudeDeg,longitudeSpeed,latitudeDeg:-2.25,latitudeSpeed:0.012,
  rightAscensionDeg:32.5,declinationDeg:-7.25,distanceAu:1.25,distanceSpeed:-0.003,ephemerisSource:'moshier'});
const houses=[{id:'egizia',ascendantDeg:15,mcDeg:280,cuspsDeg:Array.from({length:12},(_,i)=>i*30)}, {id:'placido',ascendantDeg:15,mcDeg:280,cuspsDeg:Array.from({length:12},(_,i)=>(15+i*30)%360)}];
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
test('inspector preserves provider positions and rates without deriving new facts',()=>{
 const row=chartInspectorRows(chart,'egizia')[0];
 assert.deepEqual([row.longitudeSpeed,row.latitude,row.latitudeSpeed,row.rightAscension,row.declination,row.distanceAu,row.distanceSpeed],
   [1,-2.25,0.012,32.5,-7.25,1.25,-0.003]);
 assert.equal(row.source,'moshier');
});
test('axes derive only exact opposites and use the selected house system',()=>{
 const egizia=chartInspectorAxes(chart,'egizia'), placido=chartInspectorAxes(chart,'placido');
 assert.deepEqual(egizia.map(a => [a.id,a.longitude,a.house]), [['AS',15,1],['DS',195,7],['MC',280,10],['IC',100,4]]);
 assert.equal(placido.find(a=>a.id==='MC').house,9);
 assert.equal(placido.find(a=>a.id==='IC').house,3);
 assert.deepEqual(chartInspectorAxes(chart,null), []);
 const invalid=chartInspectorAxes({bodies:[],houses:[{id:'egizia',ascendantDeg:350,mcDeg:270,cuspsDeg:[0]}]},'egizia');
 assert.equal(invalid.find(a=>a.id==='DS').longitude,170);
 assert.ok(invalid.every(a=>a.house===null));
});
test('calculated and configurable point names have Italian and English labels',()=>{
 for (const id of new Set([...CHART_BODY_IDS,...POINT_IDS])) {
   assert.equal(typeof pointLabel(id,'it'),'string');
   assert.ok(pointLabel(id,'it').length > 0);
   assert.equal(typeof pointLabel(id,'en'),'string');
   assert.ok(pointLabel(id,'en').length > 0);
 }
 assert.equal(pointLabel('Sun','it'),'Sole');
 assert.equal(pointLabel('true Node','it'),'Nodo Nord vero');
 assert.equal(pointLabel('Sun','en'),'Sun');
 assert.equal(pointLabel('unrecognized','it'),'unrecognized');
});
