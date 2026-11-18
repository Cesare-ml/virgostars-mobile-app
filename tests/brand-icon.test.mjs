import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const config = JSON.parse(readFileSync(new URL('src-tauri/tauri.conf.json', root), 'utf8'));

function pngSize(path) {
  const bytes = readFileSync(new URL(path, root));
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

// Modification 2026-11-18: the dimensions alone did not catch a truncated
// IDAT chunk with an invalid CRC in the checked-in launcher source.
function validateRgbaPng(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
  let offset = 8, width, height, ended = false;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    assert.ok(length <= bytes.length - offset - 12, 'truncated PNG chunk');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(offset + 4, offset + 8 + length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, bytes.readUInt32BE(offset + 8 + length), `${type} CRC`);
    if (type === 'IHDR') {
      assert.equal(length, 13);
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      assert.deepEqual([...bytes.subarray(offset + 16, offset + 21)], [8, 6, 0, 0, 0]);
    }
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') { ended = true; break; }
  }
  assert.ok(ended && offset === bytes.length && width && height && compressed.length, 'incomplete PNG');
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4 + 1;
  assert.equal(raw.length, stride * height);
  for (let y = 0; y < height; y++) assert.ok(raw[y * stride] <= 4, 'invalid PNG filter');
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

test('launcher PNGs and ICNS are complete and reject corrupted image data', () => {
  for (const path of ['src/assets/virgostars-icon.png', 'src/assets/virgostars-mark.png', 'src-tauri/icons/icon.png']) {
    validateRgbaPng(readFileSync(new URL(path, root)));
  }
  const damaged = Buffer.from(readFileSync(new URL('src/assets/virgostars-icon.png', root)));
  damaged[41] ^= 1; // First IDAT byte, leaving its CRC unchanged.
  assert.throws(() => validateRgbaPng(damaged));
  const icns = readFileSync(new URL('src-tauri/icons/icon.icns', root));
  assert.equal(icns.toString('ascii', 0, 4), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length, 'truncated ICNS');
});
