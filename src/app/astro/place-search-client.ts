import {invoke, isTauri} from '@tauri-apps/api/core';
import {decodeOfflinePlaceResults} from '../native/offline-places-contract';
import {normalizePlaceQuery, type Place} from './place-search';

type PendingSearch={query:string;locale:'it'|'en';resolve:(places:readonly Place[])=>void;reject:(reason:Error)=>void};
let pending:PendingSearch|undefined;
let running=false;

// Serialize and coalesce searches while a long prefix search or catalog copy is
// running. The component's request ticket ignores cancelled/stale results.
async function drain():Promise<void> {
  if (running) return;
  running=true;
  try {
    while (pending) {
      const job=pending;pending=undefined;
      try {
        const raw=await invoke('search_offline_places',{query:normalizePlaceQuery(job.query),limit:12});
        job.resolve(decodeOfflinePlaceResults(raw).map(p=>({
    id:p.id, name:job.locale==='it' && p.italianName?.trim() ? p.italianName : p.name,
    latitude:p.latMicro/1_000_000, longitude:p.lngMicro/1_000_000,
    country:p.countryCode ?? '',countryName:p.countryName ?? '',region:p.region ?? '',
    zone:p.timeZone ?? '',population:p.population ?? 0,
        })));
      } catch {job.reject(new Error('Place catalog unavailable'));}
    }
  } finally {running=false;}
}

/** Search the bundled desktop database through the native bridge only. */
export function searchPlaceCatalog(query:string, locale:'it'|'en'):Promise<readonly Place[]> {
  if (!isTauri()) return Promise.reject(new Error('Place catalog unavailable'));
  return new Promise((resolve,reject)=>{
    pending?.reject(new Error('Search superseded'));
    pending={query,locale,resolve,reject};void drain();
  });
}
