import {invoke, isTauri} from '@tauri-apps/api/core';
import {loadStartup, saveStartup, type StartupPreference} from '../startup-preference';

type StartupResult = {kind:'ready';preference:StartupPreference}|{kind:'unavailable'};
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function decode(raw:unknown):StartupResult {
  if(!raw || typeof raw!=='object') return {kind:'unavailable'};
  const result=raw as Record<string,unknown>, p=result['preference'];
  if(result['protocolVersion']!==1 || result['status']!=='ok' || !p || typeof p!=='object') return {kind:'unavailable'};
  const value=p as Record<string,unknown>, mode=value['mode'], chartId=value['chartId'];
  if((mode!=='sky' && mode!=='natal-transits') || (chartId!==null && (typeof chartId!=='string' || !ID.test(chartId))) || (mode==='natal-transits' && chartId===null)) return {kind:'unavailable'};
  return {kind:'ready',preference:{mode,chartId:chartId as string|null}};
}
export async function readStartup():Promise<StartupResult> {
  try {
    if(!isTauri()) return {kind:'ready',preference:loadStartup(window.localStorage)};
    return decode(await invoke('startup_preference',{request:{protocolVersion:1,operation:'get'}}));
  } catch {return {kind:'unavailable'};}
}
export async function writeStartup(preference:StartupPreference):Promise<boolean> {
  try {
    if(!isTauri()) return saveStartup(window.localStorage,preference);
    const result=decode(await invoke('startup_preference',{request:{protocolVersion:1,operation:'set',preference}}));
    return result.kind==='ready' && result.preference.mode===preference.mode && result.preference.chartId===preference.chartId;
  } catch {return false;}
}
