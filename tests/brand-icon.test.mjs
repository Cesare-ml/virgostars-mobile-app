import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const config = JSON.parse(readFileSync(new URL('src-tauri/tauri.conf.json', root), 'utf8'));

function pngSize(path) {
  const bytes = readFileSync(new URL(path, root));
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('mobile brand uses the official raster emblem as launcher icon source', () => {
  assert.equal(pkg.scripts.icons, 'tauri icon src/assets/virgostars-icon.png');
  assert.deepEqual(pngSize('src/assets/virgostars-icon.png'), [1024, 1024]);
  assert.deepEqual(pngSize('src/assets/virgostars-mark.png'), [512, 512]);
  assert.deepEqual(pngSize('src-tauri/icons/icon.png'), [512, 512]);
  assert.ok(config.bundle.icon.includes('icons/icon.ico'));
  assert.ok(config.bundle.icon.includes('icons/icon.icns'));
  assert.match(pkg.scripts['android:build'], /npm run icons/);
});
