/** Generate dark, open-font latitude glyphs into a NEW directory; requires sibling Charts' sharp. */
import sharp from '../../astrological-charts/node_modules/sharp/lib/index.js';
import {mkdir, access} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const names = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron',
  'mean Node','true Node','mean Node Sud','true Node Sud','mean Apogee','osc. Apogee','mean Perigee','osc. Perigee'];
if (process.argv.length !== 3) throw new Error('Usage: node scripts/generate-light-latitude-symbols.mjs <new-directory>');
const destination = resolve(process.argv[2]);
try {await access(destination); throw new Error('Output already exists; choose a new directory');}
catch (error) {if (error?.code !== 'ENOENT') throw error;}
await mkdir(destination);
const source = 'src/chart-symbols/img/simboli-bianchi/elementi-celesti';
for (const name of names) {
  const outputName = name === 'true Node' ? 'true node' : name;
  const original = join(source, name + '.png');
  const metadata = await sharp(original).metadata();
  if (!metadata.width || !metadata.height || !metadata.hasAlpha) throw new Error('Invalid source glyph');
  const alpha = await sharp(original).extractChannel('alpha').png().toBuffer();
  await sharp({create:{width:metadata.width,height:metadata.height,channels:3,background:'#303846'}})
    .joinChannel(alpha).png().toFile(join(destination, outputName + '.png'));
}
console.log(`Generated ${names.length} light-theme latitude symbols.`);
