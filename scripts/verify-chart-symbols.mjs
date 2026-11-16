import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const source='src/chart-symbols', built='dist/virgostars-mobile/browser/assets';
function files(dir) {return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const hash=b=>createHash('sha256').update(b).digest('hex');
const all=files(source);
assert.equal(all.length,70,'Expected all generated symbol textures');
const bodies=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron',
  'mean Node','true Node','mean Node Sud','true Node Sud','mean Apogee','osc. Apogee','mean Perigee','osc. Perigee','AS','DS','MC','IC'];
for (const body of bodies) for (const suffix of ['', '-r'])
  assert.ok(existsSync(join(source,'img','simboli-bianchi','elementi-celesti',body+suffix+'.png')),`Missing body: ${body}${suffix}`);
for(let i=1;i<=12;i++) for(const category of ['segni','case'])
  assert.ok(existsSync(join(source,'img','simboli-bianchi',category,String(i).padStart(2,'0')+'.png')),`Missing ${category}: ${i}`);
for(const file of all) {
 const bytes=readFileSync(file), target=readFileSync(join(built,relative(source,file)));
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],`Invalid PNG: ${file}`);
 assert.equal(hash(target),hash(bytes),`Build did not preserve glyph override: ${file}`);
}
for (const name of ['NotoSansSymbols-OFL.txt','NotoSansSymbols2-OFL.txt'])
 assert.ok(readFileSync(join(built,'licenses',name)).length>1000,`Missing license: ${name}`);
console.log(`Verified ${all.length} chart glyphs and font license files in the build.`);