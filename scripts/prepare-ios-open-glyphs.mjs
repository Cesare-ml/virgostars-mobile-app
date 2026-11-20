// Generate a preview-safe glyph pack from the bundled OFL Noto fonts.
// Do not mistake these symbols for the official VirgoStars artwork.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

if (process.env.VIRGOSTARS_IOS_CI !== '1') throw Error('Open glyph preview is CI-only');
const root = resolve('.');
const generated = join(root, '.local/ios-open-generated');
const stage = join(root, '.local/private-glyphs');
const output = join(stage, 'assets');
if (!existsSync(generated)) {
  mkdirSync(dirname(generated), { recursive: true });
  const run = spawnSync('python3', ['scripts/generate-chart-glyphs.py', generated], { stdio: 'inherit' });
  if (run.error || run.status !== 0) throw Error('OFL symbol generation failed: ' + (run.error?.message ?? run.status));
}
const bodies = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus',
  'Neptune', 'Pluto', 'Chiron', 'mean Node', 'true Node', 'mean Node Sud',
  'true Node Sud', 'mean Apogee', 'osc. Apogee', 'mean Perigee',
  'osc. Perigee', 'AS', 'DS', 'MC', 'IC',
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
function copy(source, target = source) {
  const bytes = readFileSync(join(generated, 'img', ...source.split('/')));
  const dest = join(output, 'img', ...target.split('/'));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  files.push({ source: 'img/' + source, target: 'img/' + target,
    sourceSha256: sha(bytes), sha256: sha(bytes), derived: false });
}
for (const body of bodies) {
  const base = 'simboli-bianchi/elementi-celesti/' + body;
  copy(base + '.png');
  copy(base + '-r.png');
  for (const theme of ['dark', 'light']) {
    copy(base + '.png', 'symbols/planets/' + theme + '/_circle/' +
      (body === 'true Node' ? 'true node' : body) + '.png');
  }
}
for (let sign = 1; sign <= 12; sign++) {
  copy('simboli-bianchi/segni/' + String(sign).padStart(2, '0') + '.png');
}
if (files.length !== 104) throw Error('Unexpected iOS preview symbol count: ' + files.length);
mkdirSync(stage, { recursive: true });
writeFileSync(join(stage, 'manifest.json'), JSON.stringify({
  schemaVersion: 1, usage: 'open-font-ci',
  provenance: 'Locally generated OFL Noto fonts (third_party/noto-symbols)',
  files,
}, null, 2) + '\n');
console.log('Staged 104 locally generated OFL symbols for iOS CI preview; no private glyphs.');
