import test from 'node:test';
import assert from 'node:assert/strict';
import {importEphemeris, MAX_EPHEMERIS_BYTES, usnoSelection} from '../src/app/native/ephemeris-import.ts';

test('streams bounded ordered chunks and commits only after all bytes', async()=>{
  const calls=[], progress=[];
  const transport={invoke:async(command,args)=>{calls.push([command,args]);return command==='ephemeris_import_begin'?7:undefined;}};
  const bytes=new Uint8Array(70000).fill(42);
  assert.equal(await importEphemeris(new Blob([bytes]),new AbortController().signal,n=>progress.push(n),transport),'imported');
  assert.deepEqual(calls.map(c=>c[0]),['ephemeris_import_begin','ephemeris_import_chunk','ephemeris_import_chunk','ephemeris_import_finish']);
  assert.deepEqual(calls[0][1],{size:70000});
  assert.equal(calls[1][1].offset,0); assert.equal(calls[1][1].bytes.length,65536);
  assert.equal(calls[2][1].offset,65536); assert.equal(calls[2][1].bytes.length,4464);
  assert.deepEqual(calls[3][1],{id:7}); assert.equal(progress.at(-1),1);
});
test('cancellation and failures release staging without finishing', async()=>{
  const controller=new AbortController(), calls=[];
  const transport={invoke:async(command)=>{calls.push(command);if(command==='ephemeris_import_begin')return 2;if(command==='ephemeris_import_chunk')controller.abort();}};
  assert.equal(await importEphemeris(new Blob([new Uint8Array(70000)]),controller.signal,()=>{},transport),'cancelled');
  assert.deepEqual(calls,['ephemeris_import_begin','ephemeris_import_chunk','ephemeris_import_cancel']);
  const errors=[];
  const bad={invoke:async(command)=>{errors.push(command);if(command==='ephemeris_import_begin')return 3;if(command==='ephemeris_import_finish')throw 'invalid_file';}};
  assert.equal(await importEphemeris(new Blob(['bad']),new AbortController().signal,()=>{},bad),'invalid_file');
  assert.equal(errors.at(-1),'ephemeris_import_cancel');
});
test('empty and oversized files never reach native transport', async()=>{
  const transport={invoke:async()=>{throw Error('unexpected call');}};
  assert.equal(await importEphemeris(new Blob([]),new AbortController().signal,()=>{},transport),'invalid_size');
  assert.equal(await importEphemeris({size:MAX_EPHEMERIS_BYTES+1},new AbortController().signal,()=>{},transport),'invalid_size');
});
test('USNO selection requires one complete named pair and orders optional predictions', async()=>{
  const monthly=new File(['monthly'],'deltat.data'), historic=new File(['historic'],'historic_deltat.data'), preds=new File(['future'],'deltat.preds');
  const chosen=usnoSelection([preds,historic,monthly]);
  assert.deepEqual(chosen.parts,[7,8,6]);
  assert.equal(await chosen.blob.text(),'monthlyhistoricfuture');
  assert.equal(usnoSelection([monthly]),null);
  assert.equal(usnoSelection([monthly,monthly,historic]),null);
  assert.equal(usnoSelection([monthly,historic,new File(['x'],'unknown')]),null);
  assert.equal(usnoSelection([monthly,historic,new File([],'deltat.preds')]),null);
  assert.deepEqual(usnoSelection([historic,monthly]).parts,[7,8,0]);
  const calls=[],transport={invoke:async(command,args)=>{calls.push([command,args]);return command==='ephemeris_import_begin'?5:undefined;}};
  assert.equal(await importEphemeris(chosen.blob,new AbortController().signal,()=>{},transport,{kind:'usno',parts:chosen.parts}),'imported');
  assert.deepEqual(calls[0][1],{kind:'usno',size:21,parts:[7,8,6]});
});
test('Chiron transfer identifies its purpose and enforces its smaller bound',async()=>{
  const calls=[],transport={invoke:async(command,args)=>{calls.push([command,args]);return command==='ephemeris_import_begin'?9:undefined;}};
  assert.equal(await importEphemeris(new Blob(['test']),new AbortController().signal,()=>{},transport,{kind:'chiron'}),'imported');
  assert.deepEqual(calls[0][1],{size:4,kind:'chiron'});
  assert.equal(await importEphemeris({size:32*1024*1024+1},new AbortController().signal,()=>{},transport,{kind:'chiron'}),'invalid_size');
});
