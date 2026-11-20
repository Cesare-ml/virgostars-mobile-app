import type {UiPreferencesStorage} from './ui-preferences';

// Derived from VirgoStars Desktop (CPAL-1.0). Only a local archive ID is stored.
export type StartupPreference = Readonly<{mode:'sky'|'natal-transits'; chartId:string|null}>;
export const DEFAULT_STARTUP:StartupPreference = Object.freeze({mode:'sky',chartId:null});
export const STARTUP_KEY = 'virgostars.mobile.startup.v1';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function loadStartup(storage:UiPreferencesStorage|null):StartupPreference {
  try {
    const raw=storage?.getItem(STARTUP_KEY);
    if (!raw || raw.length>256) return DEFAULT_STARTUP;
    const data:unknown=JSON.parse(raw);
    if (!data || typeof data!=='object' || Array.isArray(data)) return DEFAULT_STARTUP;
    const p=data as Record<string,unknown>;
    if (p['version']!==1) return DEFAULT_STARTUP;
    const chartId=typeof p['chartId']==='string' && ID.test(p['chartId']) ? p['chartId'] : null;
    return {mode:p['mode']==='natal-transits' && chartId ? 'natal-transits' : 'sky',chartId};
  } catch {return DEFAULT_STARTUP;}
}
export function saveStartup(storage:UiPreferencesStorage|null, value:StartupPreference):boolean {
  try {
    if (!storage || !value || (value.mode!=='sky' && value.mode!=='natal-transits') ||
        (value.chartId!==null && !ID.test(value.chartId)) || (value.mode==='natal-transits' && !value.chartId)) return false;
    storage.setItem(STARTUP_KEY,JSON.stringify({version:1,mode:value.mode,chartId:value.chartId}));
    return true;
  } catch {return false;}
}
