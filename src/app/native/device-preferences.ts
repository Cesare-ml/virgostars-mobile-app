import {invoke, isTauri} from '@tauri-apps/api/core';
import {ASPECT_DEFINITIONS, POINT_IDS, CHART_SETTINGS_KEY, defaultChartSettings, loadChartSettings, sanitizeChartSettings, saveChartSettings, type ChartSettings} from '../chart-settings';
import {defaultUiPreferences, UI_PREFERENCES_KEY, loadUiPreferences, saveUiPreferences, type UiPreferences} from '../ui-preferences';
import {HOUSE_SYSTEM_IDS, type HouseSystemId} from './chart-calculation-contract';

export type DeviceUi = UiPreferences & Readonly<{houseSystem:HouseSystemId|null}>;
export type PreferenceRead<T> = Readonly<{value:T; persisted:boolean}>;
const defaultUi=():DeviceUi=>({...defaultUiPreferences(),houseSystem:null});
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const keys=(value:Record<string,unknown>,expected:readonly string[])=>Object.keys(value).length===expected.length && expected.every(key=>Object.hasOwn(value,key));

function checkedUi(raw:unknown):DeviceUi|null {
  if(!object(raw) || !keys(raw,['theme','locale','houseSystem']) ||
    (raw['theme']!=='dark' && raw['theme']!=='light') || (raw['locale']!=='it' && raw['locale']!=='en') ||
    (raw['houseSystem']!==null && !HOUSE_SYSTEM_IDS.some(id=>id===raw['houseSystem']))) return null;
  return {theme:raw['theme'],locale:raw['locale'],houseSystem:raw['houseSystem'] as HouseSystemId|null};
}
function checkedChart(raw:unknown):ChartSettings|null {
  if(!object(raw) || !keys(raw,['showAspects','aspects','points']) || typeof raw['showAspects']!=='boolean' || !object(raw['aspects']) || !object(raw['points'])) return null;
  const aspects=raw['aspects'],points=raw['points'];
  if(!keys(aspects,ASPECT_DEFINITIONS.map(a=>a.id)) || !keys(points,POINT_IDS)) return null;
  for(const {id} of ASPECT_DEFINITIONS) {
    const item=aspects[id];if(!object(item) || !keys(item,['active','orb']) || typeof item['active']!=='boolean' ||
      !(item['orb']===null || (typeof item['orb']==='number' && Number.isFinite(item['orb']) && item['orb']>=0.1 && item['orb']<=15))) return null;
  }
  for(const id of POINT_IDS) {
    const item=points[id];if(!object(item) || !keys(item,['shown','orb','aspects']) || typeof item['shown']!=='boolean' || typeof item['aspects']!=='boolean' ||
      typeof item['orb']!=='number' || !Number.isFinite(item['orb']) || item['orb']<0 || item['orb']>15) return null;
  }
  return sanitizeChartSettings(raw);
}
function response(raw:unknown,section:'ui'|'chart'):unknown {
  if(!object(raw) || raw['protocolVersion']!==1 || raw['status']!=='ok' || !Object.hasOwn(raw,section) || raw[section==='ui'?'chart':'ui']!==null) throw Error('unavailable');
  return raw[section];
}
function legacyStorage(key:string,max:number):Storage {
  const storage=window.localStorage, raw=storage.getItem(key);
  if(raw!==null) {
    if(raw.length>max) throw Error('unsupported');
    const parsed:unknown=JSON.parse(raw);
    if(!object(parsed) || parsed['version']!==1 || (key===CHART_SETTINGS_KEY && !object(parsed['settings']))) throw Error('unsupported');
  }
  return storage;
}
const HOUSE_KEY='virgostars.mobile.house-system.v1';
function browserHouse(storage:Storage):HouseSystemId|null {
  const raw=storage.getItem(HOUSE_KEY);
  if(raw===null) return null;
  if(raw.length>128) throw Error('unsupported');
  const value:unknown=JSON.parse(raw);
  if(!object(value) || value['version']!==1 || (value['houseSystem']!==null && !HOUSE_SYSTEM_IDS.some(id=>id===value['houseSystem']))) throw Error('unsupported');
  return value['houseSystem'] as HouseSystemId|null;
}
async function nativeWrite(section:'ui'|'chart',value:DeviceUi|ChartSettings):Promise<boolean> {
  try {
    const raw=await invoke('device_preferences',{request:{protocolVersion:1,operation:'set',section,[section]:value}});
    const saved=response(raw,section);
    if(section==='ui') return JSON.stringify(checkedUi(saved))===JSON.stringify(checkedUi(value));
    return JSON.stringify(checkedChart(saved))===JSON.stringify(checkedChart(value));
  } catch {return false;}
}
export async function readDeviceUi():Promise<PreferenceRead<DeviceUi>> {
  try {
    if(isTauri()) {
      const saved=response(await invoke('device_preferences',{request:{protocolVersion:1,operation:'get',section:'ui'}}),'ui');
      if(saved!==null) {const value=checkedUi(saved);if(!value) throw Error('invalid');return {value,persisted:true};}
      const value={...loadUiPreferences(legacyStorage(UI_PREFERENCES_KEY,512)),houseSystem:null};
      return {value,persisted:await nativeWrite('ui',value)};
    }
    const storage=legacyStorage(UI_PREFERENCES_KEY,512);
    return {value:{...loadUiPreferences(storage),houseSystem:browserHouse(storage)},persisted:true};
  } catch {
    try {return {value:{...loadUiPreferences(legacyStorage(UI_PREFERENCES_KEY,512)),houseSystem:null},persisted:false};}
    catch {return {value:defaultUi(),persisted:false};}
  }
}
export async function readDeviceChart():Promise<PreferenceRead<ChartSettings>> {
  try {
    if(isTauri()) {
      const saved=response(await invoke('device_preferences',{request:{protocolVersion:1,operation:'get',section:'chart'}}),'chart');
      if(saved!==null) {const value=checkedChart(saved);if(!value) throw Error('invalid');return {value,persisted:true};}
      const value=loadChartSettings(legacyStorage(CHART_SETTINGS_KEY,8192));
      return {value,persisted:await nativeWrite('chart',value)};
    }
    return {value:loadChartSettings(legacyStorage(CHART_SETTINGS_KEY,8192)),persisted:true};
  } catch {
    try {return {value:loadChartSettings(legacyStorage(CHART_SETTINGS_KEY,8192)),persisted:false};}
    catch {return {value:defaultChartSettings(),persisted:false};}
  }
}
export async function writeDeviceUi(value:DeviceUi):Promise<boolean> {
  try {
    const clean=checkedUi(value);if(!clean) return false;
    if(isTauri()) return await nativeWrite('ui',clean);
    if(!saveUiPreferences(window.localStorage,clean)) return false;
    window.localStorage.setItem(HOUSE_KEY,JSON.stringify({version:1,houseSystem:clean.houseSystem}));return true;
  } catch {return false;}
}
export async function writeDeviceChart(value:ChartSettings):Promise<boolean> {
  try {const clean=sanitizeChartSettings(value);return isTauri() ? await nativeWrite('chart',clean) : saveChartSettings(window.localStorage,clean);} catch {return false;}
}
