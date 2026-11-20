import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const stage='.local/private-glyphs', built='dist/virgostars-mobile/browser/assets';
const manifest=JSON.parse(readFileSync(join(stage,'manifest.json'),'utf8'));
const approved=JSON.parse(readFileSync('../astrological-assets/manifests/approved-assets.json','utf8'));
const entries=new Map(approved.assets.map(item=>[item.path,item]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.usage,'private-local-only');
assert.equal(manifest.files.length,104);
for(const file of manifest.files) {
  const original=readFileSync(join('../astrological-assets/public/assets',file.source));
  assert.equal(hash(original),entries.get(file.source)?.sha256,`Source changed: ${file.source}`);
  assert.equal(file.sourceSha256,hash(original),`Staged provenance changed: ${file.source}`);
  const staged=readFileSync(join(stage,'assets',file.target));
  assert.equal(hash(staged),file.sha256,`Staged glyph changed: ${file.target}`);
  assert.equal(hash(readFileSync(join(built,file.target))),file.sha256,`Build did not use astrological-assets: ${file.target}`);
}
for(const name of ['NotoSansSymbols-OFL.txt','NotoSansSymbols2-OFL.txt'])
  assert.ok(readFileSync(join(built,'licenses',name)).length>1000,`Missing license: ${name}`);
console.log(`Verified ${manifest.files.length} private astrological-assets glyphs in the build.`);
