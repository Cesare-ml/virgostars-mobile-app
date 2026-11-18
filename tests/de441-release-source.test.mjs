import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const source = read('src/assets/de441-release-source-v1.json');
const catalog = read('src/assets/de441-pack-catalog.json');

test('release source identifies the explicitly published version and preserves pending gates', () => {
  assert.equal(source.schema, 'virgostars.de441.release-source.v1');
  assert.equal(source.releaseTag, 'de441-mobile-v1.0.0');
  assert.equal(source.distributionRights, 'review_pending');
  assert.equal(source.downloadImplementation, 'not_implemented');
  assert.equal(source.manifestBytes, 8657);
  assert.equal(source.manifestSha256, 'a4a204169555ee4ec01d5b3f25ce331a44ff6c9fd273d7f812cfa245e6ef6b7a');
  assert.equal(source.releaseUrl, `https://github.com/Cesare-ml/VirgoStars-Ephemeris/releases/tag/${source.releaseTag}`);
  assert.equal(source.assetBaseUrl, `https://github.com/Cesare-ml/VirgoStars-Ephemeris/releases/download/${source.releaseTag}/`);
});

test('every local pack maps to exactly one fixed release asset', () => {
  const names = catalog.packs.map(pack => pack.filename);
  assert.equal(names.length, 10);
  assert.equal(new Set(names).size, names.length);
  for (const name of [...names, source.manifestFilename]) {
    assert.match(name, /^de441-[a-z0-9.-]+$/);
    const url = new URL(name, source.assetBaseUrl);
    assert.equal(url.href, source.assetBaseUrl + name);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
  }
});
