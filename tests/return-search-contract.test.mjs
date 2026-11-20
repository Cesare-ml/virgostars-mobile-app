import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeReturnResponse, requestReturns, validReturnRequest} from '../src/app/native/return-search-contract.ts';

// Synthetic timestamps only: these are not return predictions or ephemeris data.
const request = Object.freeze({body:'Moon', targetLongitudeDeg:223.5, year:2000});
const instant = iso => ({utcIso:iso, julianDayUt:2_440_587.5 + Date.parse(iso) / 86_400_000});
const response = () => ({protocolVersion:1, status:'ok', provider:{id:'fixture', engineVersion:'test'}, instants:[
  instant('2000-01-01T00:00:00.000Z'), instant('2000-03-14T12:00:00.000Z'), instant('2000-12-31T23:59:59.999Z'),
]});

test('valid response is copied, frozen, chronological and bounded by the requested UTC year', () => {
  const raw = response();
  const decoded = decodeReturnResponse(raw, request);
  assert.equal(decoded.status, 'ok');
  assert.ok(Object.isFrozen(decoded.instants) && Object.isFrozen(decoded.instants[0]) && Object.isFrozen(decoded.provider));
  raw.instants[0].utcIso = 'private change';
  assert.equal(decoded.instants[0].utcIso, '2000-01-01T00:00:00.000Z');
  assert.deepEqual(decodeReturnResponse({...response(), instants:[]}, request).instants, []);
});

test('array length is snapshotted without invoking a hostile proxy getter', () => {
  const raw = response();
  raw.instants = new Proxy(raw.instants, {get(target, key, receiver) {
    if (key === 'length') throw new Error('private');
    return Reflect.get(target, key, receiver);
  }});
  assert.equal(decodeReturnResponse(raw, request).instants.length, 3);
});

test('bad native payloads, dates, sequence and year boundaries fail closed', () => {
  const mutations = [
    r => r.protocolVersion = 2,
    r => r.status = 'unknown',
    r => r.provider.id = 'contains secret',
    r => r.instants[0] = instant('1999-12-31T23:59:59.999Z'),
    r => r.instants[2] = instant('2001-01-01T00:00:00.000Z'),
    r => r.instants[1].utcIso = '2000-02-30T12:00:00.000Z',
    r => r.instants[1].julianDayUt += 0.1,
    r => r.instants.reverse(),
    r => r.instants[1] = r.instants[0],
    r => r.instants.length = 5,
    r => Object.defineProperty(r.instants[0], 'utcIso', {get() { throw new Error('private'); }, enumerable:true}),
    r => r.instants = Array.from({length:17}, () => instant('2000-01-01T00:00:00.000Z')),
  ];
  for (const mutate of mutations) {
    const raw = response(); mutate(raw);
    assert.throws(() => decodeReturnResponse(raw, request), {message:'Invalid return search protocol'});
  }
  assert.throws(() => decodeReturnResponse(response(), {...request, body:'Sun'}), {message:'Invalid return search protocol'});
  assert.throws(() => decodeReturnResponse(response(), {...request, year:2001}), {message:'Invalid return search protocol'});
});

test('invalid and hostile request objects never invoke the native transport', async () => {
  let calls = 0;
  const transport = {isNative:() => true, invoke:async () => {calls++; return response();}};
  const getter = {...request};
  Object.defineProperty(getter, 'year', {get() {throw new Error('private');}, enumerable:true});
  const proxy = new Proxy({...request}, {getPrototypeOf() {throw new Error('private');}});
  for (const value of [null, getter, proxy, {...request, body:'Mars'}, {...request, targetLongitudeDeg:360},
    {...request, targetLongitudeDeg:NaN}, {...request, year:1599}, {...request, year:2401}, {...request, year:2000.1}]) {
    assert.equal(validReturnRequest(value), false);
    assert.deepEqual(await requestReturns(transport, value), {kind:'invalid_request'});
  }
  assert.equal(calls, 0);
  assert.ok(validReturnRequest({body:'Sun', targetLongitudeDeg:0, year:1600}));
  assert.ok(validReturnRequest({body:'Moon', targetLongitudeDeg:359.99, year:2400}));
});

test('only reviewed scalar fields cross the transport and later mutations do not alter validation', async () => {
  const input = {...request, name:'not forwarded'};
  let sent;
  const result = await requestReturns({isNative:() => true, invoke:async (command, args) => {
    sent = [command, args]; input.year = 2001; input.targetLongitudeDeg = 0;
    return response();
  }}, input);
  assert.equal(result.kind, 'ready');
  assert.deepEqual(sent, ['find_returns', {request:{protocolVersion:1, ...request}}]);
});

test('provider absence, preview and malformed or failed transport stay distinct and opaque', async () => {
  assert.deepEqual(await requestReturns({isNative:() => false, invoke:async () => {throw new Error();}}, request), {kind:'not_native'});
  for (const status of ['provider_unavailable','invalid_request','calculation_failed']) {
    assert.deepEqual(await requestReturns({isNative:() => true, invoke:async () => ({protocolVersion:1,status})}, request), {kind:status});
  }
  assert.deepEqual(await requestReturns({isNative:() => true, invoke:async () => {throw new Error('private');}}, request), {kind:'unavailable'});
  assert.deepEqual(await requestReturns({isNative:() => true, invoke:async () => response()}, {...request, year:2001}), {kind:'unavailable'});
});

test('return contract is isolated: no app import or native command is registered', async () => {
  const lib = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/app.component.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /find_returns|return_search/);
  assert.doesNotMatch(app, /return-search-contract|requestReturns/);
});
