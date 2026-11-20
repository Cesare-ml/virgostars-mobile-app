import test from 'node:test';
import assert from 'node:assert/strict';
import {pngFile, sharePng} from '../src/app/png-share.ts';

test('a prepared PNG is shared only after an explicit supported share request', async () => {
  const file = pngFile('data:image/png;base64,iVBORw0KGgo=', 'virgostars-chart-natal-dark.png');
  assert.equal(file.name, 'virgostars-chart-natal-dark.png');
  assert.equal(file.type, 'image/png');
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [137,80,78,71,13,10,26,10]);
  let called = 0;
  assert.equal(await sharePng(null, file), false);
  assert.equal(await sharePng({canShare: () => false, share: async () => {called++;}}, file), false);
  assert.equal(called, 0);
  assert.equal(await sharePng({canShare: ({files}) => files[0] === file, share: async ({files}) => {assert.equal(files[0], file); called++;}}, file), true);
  assert.equal(called, 1);
});

test('share cancellation and errors are passed to the UI without a download fallback', async () => {
  const error = new Error('cancelled');
  error.name = 'AbortError';
  await assert.rejects(sharePng({canShare: () => true, share: async () => {throw error;}}, new File([], 'x.png')), {name:'AbortError'});
});
