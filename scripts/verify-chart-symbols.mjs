import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const stage='.local/private-glyphs', built='dist/virgostars-mobile/browser/assets';
const manifest=JSON.parse(readFileSync(join(stage,'manifest.json'),'utf8'));
const openFont=manifest.usage==='open-font-ci';
assert.ok(openFont || manifest.usage==='private-local-only', 'Unknown glyph provenance');
if (openFont) assert.equal(process.env.VIRGOSTARS_IOS_CI,'1', 'Open-font preview must be explicit');
const entries = openFont ? null : new Map(JSON.parse(
  readFileSync('../astrological-assets/manifests/approved-assets.json','utf8')).assets
  .map(item=>[item.path,item]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.files.length,104);
for(const file of manifest.files) {
  const original=readFileSync(join(openFont?'.local/ios-open-generated':'../astrological-assets/public/assets',file.source));
  if (!openFont) assert.equal(hash(original),entries.get(file.source)?.sha256,`Source changed: ${file.source}`);
  assert.equal(file.sourceSha256,hash(original),`Staged provenance changed: ${file.source}`);
  const staged=readFileSync(join(stage,'assets',file.target));
  assert.equal(hash(staged),file.sha256,`Staged glyph changed: ${file.target}`);
  assert.equal(hash(readFileSync(join(built,file.target))),file.sha256,`Build did not use staged glyph: ${file.target}`);
}
for(const name of ['NotoSansSymbols-OFL.txt','NotoSansSymbols2-OFL.txt'])
  assert.ok(readFileSync(join(built,'licenses',name)).length>1000,`Missing license: ${name}`);
console.log(`Verified ${manifest.files.length} ${openFont?'open-font preview':'private'} glyphs in the build.`);
