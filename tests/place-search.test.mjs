import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePlaces,searchPlaces} from '../src/app/astro/place-search.ts';
const places=decodePlaces([[1,'Roma','Rome',41.89,12.49,'IT','07','Europe/Rome',2700000,['Rome']] ,[2,'Róma','Roma',1,2,'XX','01','UTC',10,[]],[3,'Aroma','Aroma',1,2,'XX','01','UTC',1,[]]]);
test('search normalizes accents, prioritizes prefixes and bounds results',()=>{
 assert.deepEqual(searchPlaces(places,'roma').map(x=>x.id),[1,2,3]);
 assert.equal(searchPlaces(places,'roma',1).length,1);
 assert.deepEqual(searchPlaces(places,'r'),[]);
});
test('rejects malformed or out-of-range catalogue entries',()=>{
 assert.throws(()=>decodePlaces([[1,'X','X',100,0,'IT','','UTC',1,[]]]));
 assert.throws(()=>decodePlaces([[1,'X','X',0,0,'IT','','',1,[]]]));
 assert.throws(()=>decodePlaces({}));
});
test('bundled GeoNames snapshot is intact and resolves Roma', async () => {
 const {readFile} = await import('node:fs/promises');
 const {createHash} = await import('node:crypto');
 const bytes = await readFile(new URL('../src/assets/cities5000.json', import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'cc1ed9715545a6cfc462ed7fafbea12c3d728010f9340da10cefb89753004aea');
 const all = decodePlaces(JSON.parse(bytes.toString('utf8')));
 assert.equal(all.length,70042);
 const city = searchPlaces(all,'Roma').find(p=>p.id===3169070);
 assert.ok(city);
 assert.equal(city.country,'IT');
 assert.equal(city.zone,'Europe/Rome');
});