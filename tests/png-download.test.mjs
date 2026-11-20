import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSyntheticPngDownload } from '../src/app/png-download.ts';

const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YlxYy8AAAAASUVORK5CYII=';
const filename = 'virgostars-synthetic-natal-light.png';

function mockPort(failAt = null) {
  const calls = [];
  let hrefValue = '';
  let filenameValue = '';
  const anchor = {
    set href(value) {
      calls.push('href');
      if (failAt === 'href') throw new Error('href');
      hrefValue = value;
    },
    get href() { return hrefValue; },
    set download(value) {
      calls.push('filename');
      if (failAt === 'filename') throw new Error('filename');
      filenameValue = value;
    },
    get download() { return filenameValue; },
    click() {
      calls.push('click');
      if (failAt === 'click') throw new Error('click');
    },
    remove() {
      calls.push('remove');
      if (failAt === 'remove') throw new Error('remove');
    },
  };
  const port = {
    createAnchor() {
      calls.push('create');
      if (failAt === 'create') throw new Error('create');
      return anchor;
    },
    appendAnchor(value) {
      assert.strictEqual(value, anchor);
      calls.push('append');
      if (failAt === 'append') throw new Error('append');
    },
  };
  return { port, calls, anchor };
}

test('appends before clicking, preserves verified filename, and removes after click', () => {
  const { port, calls, anchor } = mockPort();
  requestSyntheticPngDownload(url, filename, port);
  assert.deepEqual(calls, ['create', 'href', 'filename', 'append', 'click', 'remove']);
  assert.equal(anchor.href, url);
  assert.equal(anchor.download, filename);
});

for (const failAt of ['href', 'filename', 'append', 'click', 'remove']) {
  test(`never leaves an owned anchor attached after ${failAt} failure`, () => {
    const { port, calls } = mockPort(failAt);
    assert.throws(() => requestSyntheticPngDownload(url, filename, port), { message: failAt });
    assert.equal(calls.filter(x => x === 'remove').length, 1);
    assert.equal(calls.includes('click'), failAt === 'click' || failAt === 'remove');
  });
}

test('constructor failure does not attempt cleanup of an anchor that does not exist', () => {
  const { port, calls } = mockPort('create');
  assert.throws(() => requestSyntheticPngDownload(url, filename, port), { message: 'create' });
  assert.deepEqual(calls, ['create']);
});

test('each request owns an independent anchor lifetime; no stale click state', () => {
  const a = mockPort();
  const b = mockPort();
  requestSyntheticPngDownload(url, filename, a.port);
  requestSyntheticPngDownload(url, filename, b.port);
  assert.equal(a.calls.filter(x => x === 'remove').length, 1);
  assert.equal(b.calls.filter(x => x === 'remove').length, 1);
});
