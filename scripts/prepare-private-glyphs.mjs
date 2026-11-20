// Stage only individually manifest-verified, privately approved chart glyphs.
// This local build input is not a public redistribution approval.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import sharp from '../../astrological-charts/node_modules/sharp/lib/index.js';

const source=resolve('../astrological-assets');
const output=resolve('.local/private-glyphs');
const manifest=JSON.parse(await readFile(join(source,'manifests/approved-assets.json'),'utf8'));
const entries=new Map(manifest.assets.map(item=>[item.path,item]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const planets=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron',
  'mean Node','true Node','mean Node Sud','true Node Sud','mean Apogee','osc. Apogee','mean Perigee','osc. Perigee','AS','DS','MC','IC'];
const files=[];
async function stage(sourcePath,targetPath=sourcePath,markRetrograde=false) {
  const entry=entries.get(sourcePath);
  if(!entry || !entry.permissionBasis?.includes('private') || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw Error(`No private manifest approval for ${sourcePath}`);
  const original=await readFile(join(source,'public/assets',...sourcePath.split('/')));
  if(original.length!==entry.bytes || hash(original)!==entry.sha256) throw Error(`Asset verification failed: ${sourcePath}`);
  // Two mean-point retrograde variants are absent upstream: overlay an R on the original glyph.
  const mark=Buffer.from('<svg width="100" height="69" xmlns="http://www.w3.org/2000/svg"><path d="M81 47v16m0-16h6c7 0 7 8 0 8h-6m5 0 7 8" fill="none" stroke="white" stroke-width="2.5"/></svg>');
  const bytes=markRetrograde ? await sharp(original).composite([{input:mark}]).png().toBuffer() : original;
  const target=join(output,'assets',...targetPath.split('/'));
  await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
  files.push({source:sourcePath,target:targetPath,sourceSha256:entry.sha256,sha256:hash(bytes),derived:markRetrograde});
}
for(const body of planets) {
  const base=`img/simboli-bianchi/elementi-celesti/${body}.png`;
  const retro=`img/simboli-bianchi/elementi-celesti/${body}-r.png`;
  await stage(base);
  await stage(entries.has(retro)?retro:base,retro,!entries.has(retro) && (body==='mean Apogee' || body==='mean Perigee'));
  for(const theme of ['dark','light']) {
    const circle=`img/symbols/planets/${theme}/_circle/${body==='true Node'?'true node':body}.png`;
    await stage(circle);
  }
}
for(let sign=1;sign<=12;sign++) await stage(`img/simboli-bianchi/segni/${String(sign).padStart(2,'0')}.png`);
await writeFile(join(output,'manifest.json'),JSON.stringify({schemaVersion:1,usage:'private-local-only',files},null,2)+'\n');
console.log(`Staged ${files.length} individually verified private glyphs for local builds.`);
