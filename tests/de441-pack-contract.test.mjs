import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importPack} from '../src/app/native/de441-pack-transfer.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('src/assets/de441-pack-catalog.json'));

test('DE441 catalog covers exactly the intended mobile intervals, without distributing kernels', () => {
  assert.equal(catalog.schema, 'virgostars.de441.pack-catalog.v1');
  assert.equal(catalog.distributionRights, 'review_pending');
  assert.equal(catalog.scientificValidation, 'independent_reference_pending');
  assert.equal(catalog.packs.length, 10);
  assert.deepEqual(catalog.packs.map(pack => [pack.firstYear, pack.lastYear]),
    [[1600, 2100], [0, 199], [200, 399], [400, 599], [600, 799],
      [800, 999], [1000, 1199], [1200, 1399], [1400, 1599], [2101, 2300]]);
  assert.equal(catalog.packs.reduce((sum, pack) => sum + pack.bytes, 0), 214130192);
  assert.equal(catalog.packs.find(pack => pack.id === 'core').sha256,
    '863c83229749d12751320447da01ddd9e72e813c7512723b8cab905ec69ab21f');
  assert.equal(catalog.packs.find(pack => pack.id === 'core').bytes, 46599968);
  assert.equal(catalog.packs.filter(pack => pack.required).length, 1);
  for (const pack of catalog.packs) {
    assert.match(pack.id, /^(?:core|history-\d{4}-\d{4}|future-\d{4}-\d{4})$/);
    assert.match(pack.filename, /^de441-[a-z0-9-]+\.eph$/);
    assert.match(pack.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(pack.bytes) && pack.bytes > 0);
    assert.ok(!Object.hasOwn(pack, 'downloadUrl'));
  }
  assert.doesNotMatch(read('src-tauri/tauri.conf.json'), /https:\/\/.*de441.*\.eph/i);
  assert.doesNotMatch(read('src-tauri/capabilities/default.json'), /fs:|http:|dialog:/);
});

test('bounded transfer streams bytes in correct order and reports progress', async () => {
  const input = new Uint8Array(300_001);
  for (let i = 0; i < input.length; i++) input[i] = i % 251;
  const received = [];
  let receivedBytes = 0;
  const calls = [];
  const progress = [];
  const transport = {async invoke(command, args) {
    calls.push(command);
    if (command === 'ephemeris_pack_begin') return;
    if (command === 'ephemeris_pack_write') {
      assert.equal(args.offset, receivedBytes);
      const chunk = Buffer.from(args.chunkBase64, 'base64');
      assert.ok(chunk.length <= 128 * 1024);
      received.push(chunk);
      receivedBytes += chunk.length;
      return receivedBytes;
    }
    if (command === 'ephemeris_pack_finish') return {id:'core', status:'verified'};
    throw new Error('unexpected command');
  }};
  const result = await importPack(transport, {id:'core',bytes:input.length}, new Blob([input]), value => progress.push(value));
  assert.deepEqual(result, {id:'core',status:'verified'});
  assert.deepEqual(Buffer.concat(received), Buffer.from(input));
  assert.deepEqual(calls, ['ephemeris_pack_begin', 'ephemeris_pack_write', 'ephemeris_pack_write', 'ephemeris_pack_write', 'ephemeris_pack_finish']);
  assert.equal(progress.at(-1), 1);
  assert.equal(progress.length, 3);
});

test('mismatched lengths fail before opening an upload', async () => {
  let invoked = false;
  const transport = {async invoke() { invoked = true; }};
  await assert.rejects(importPack(transport, {id:'core',bytes:10}, new Blob(['short']), () => {}), /file_size_mismatch/);
  assert.equal(invoked, false);
});

test('bad native offset cancels partial upload, never finalizes', async () => {
  const calls = [];
  const transport = {async invoke(command) {
    calls.push(command);
    if (command === 'ephemeris_pack_write') return 5;
    return undefined;
  }};
  await assert.rejects(importPack(transport, {id:'core',bytes:10}, new Blob(['0123456789']), () => {}), /upload_offset_mismatch/);
  assert.deepEqual(calls, ['ephemeris_pack_begin', 'ephemeris_pack_write', 'ephemeris_pack_cancel']);
});

test('user abort between chunks triggers native staging cleanup', async () => {
  const controller = new AbortController();
  const calls = [];
  const blob = new Blob([new Uint8Array(262_145)]);
  const transport = {async invoke(command, args) {
    calls.push(command);
    if (command === 'ephemeris_pack_write') return args.offset + Buffer.from(args.chunkBase64, 'base64').length;
    return undefined;
  }};
  await assert.rejects(
    importPack(transport, {id:'core',bytes:blob.size}, blob, () => controller.abort(), controller.signal),
    /upload_cancelled/,
  );
  assert.deepEqual(calls, ['ephemeris_pack_begin','ephemeris_pack_write','ephemeris_pack_cancel']);
});

test('pre-aborted import cannot open a staging session', async () => {
  const controller = new AbortController();
  controller.abort();
  const transport = {async invoke() { throw new Error('should not be called'); }};
  await assert.rejects(
    importPack(transport, {id:'core',bytes:1}, new Blob(['x']), () => {}, controller.signal),
    /upload_cancelled/,
  );
});

test('native Rust adapter exposes fixed-path commands without network or astronomical logic', () => {
  const native = read('src-tauri/src/de441_packs.rs');
  const lib = read('src-tauri/src/lib.rs');
  assert.match(native, /app_data_dir\(\)/);
  assert.match(native, /Sha256::new\(\)/);
  assert.match(native, /fs::rename\(&staging, &target\)/);
  assert.match(native, /MAX_CHUNK_BYTES: usize = 128 \* 1024/);
  assert.doesNotMatch(native, /reqwest|http_client|https:\/\/|download_url|from_url/i);
  assert.match(lib, /de441_packs::ephemeris_pack_inventory/);
  assert.match(lib, /de441_packs::ephemeris_pack_finish/);
});
