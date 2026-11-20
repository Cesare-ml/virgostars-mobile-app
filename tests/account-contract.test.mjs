import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAccount } from '../src/app/native/account-contract.ts';
import {readFileSync} from 'node:fs';

const chart={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Tema fittizio',localDate:'2000-01-01',localTime:null,timeZone:null,placeName:''};
const transport = value => ({isNative:()=>true,invoke:async (command,args)=>{
  assert.equal(command,'account_control'); assert.deepEqual(args,{operation:'sync'}); return value;
}});
test('account sync returns only bounded read-only summaries without inventing birth time', async()=>{
  const result=await requestAccount(transport({version:1,status:'synced',charts:[chart]}),'sync');
  assert.equal(result.kind,'ready'); assert.equal(result.charts[0].localTime,null);
  assert.equal(result.charts[0].name,chart.name);
});
test('account rejects unknown fields, duplicate ids, credentials and malformed data', async()=>{
  for(const value of [
    {version:1,status:'synced',charts:[chart,chart]},
    {version:1,status:'synced',charts:[{...chart,notes:'private'}]},
    {version:1,status:'synced',charts:[{...chart,localTime:'unknown'}]},
    {version:1,status:'connected',charts:[chart]},
    {version:1,status:'connected',charts:null,accessToken:'never-accepted'},
    {version:2,status:'connected',charts:null},
  ]) assert.deepEqual(await requestAccount(transport(value),'sync'),{kind:'failure',reason:'unavailable'});
});
test('browser fallback and typed errors do not expose transport details', async()=>{
  assert.deepEqual(await requestAccount({isNative:()=>false,invoke:async()=>{throw Error('must not call');}},'sync'),{kind:'not_available'});
  assert.deepEqual(await requestAccount(transport({version:1,status:'network',charts:null}),'sync'),{kind:'failure',reason:'network'});
  assert.deepEqual(await requestAccount({isNative:()=>true,invoke:async()=>{throw Error('private transport details');}},'sync'),{kind:'not_available'});
});
test('account command requires the explicit Android test capability',()=>{
  const config=JSON.parse(readFileSync(new URL('../src-tauri/tauri.android-account-experimental.conf.json',import.meta.url),'utf8'));
  const base=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
  const capability=config.app.security.capabilities[0];
  assert.deepEqual(capability.windows,['main']);assert.deepEqual(capability.platforms,['android']);
  assert.equal(capability.permissions.filter(p=>p==='allow-account-control').length,1);
  assert.deepEqual(base.app.security.capabilities,['default']);
  assert.ok(capability.permissions.every(p=>p==='core:default' || p.startsWith('allow-')));
});
