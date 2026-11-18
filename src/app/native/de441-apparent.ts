import {invoke, isTauri} from '@tauri-apps/api/core';

export type De441Position = Readonly<{id: string; longitudeDeg: number; latitudeDeg: number; distanceAu: number; longitudeSpeedDegDay: number; latitudeSpeedDegDay: number; distanceSpeedAuDay: number}>;
export type De441Result = Readonly<{status: string; packId: string | null; jdTdb: number | null; positions: readonly De441Position[]}>;
const ids = ['Sun','Moon','Mercury','Venus','Mars barycenter','Jupiter barycenter','Saturn barycenter','Uranus barycenter','Neptune barycenter','Pluto barycenter'];
const errors = ['invalid_request','storage_unavailable','calculation_failed','provider_unavailable','unsupported_utc','missing_pack','invalid_pack','outside_coverage','refinement_boundary'];

export function decodeDe441Result(raw: unknown): De441Result {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_response');
  const x = raw as Record<string, unknown>;
  if (x['protocolVersion'] !== 1 || typeof x['status'] !== 'string' || !Array.isArray(x['positions'])) throw new Error('invalid_response');
  const id = x['packId'];
  if (id !== null && (typeof id !== 'string' || !/^(core|history-\d{4}-\d{4}|future-\d{4}-\d{4})$/.test(id))) throw new Error('invalid_response');
  if (x['status'] !== 'ok') {
    if (!errors.includes(x['status']) || x['positions'].length || x['jdTdb'] !== null) throw new Error('invalid_response');
    return {status:x['status'],packId:id,jdTdb:null,positions:[]};
  }
  if (typeof x['jdTdb'] !== 'number' || !Number.isFinite(x['jdTdb']) || x['positions'].length !== ids.length || id !== null) throw new Error('invalid_response');
  const positions = x['positions'].map((p: unknown, i: number) => {
    if (!p || typeof p !== 'object') throw new Error('invalid_response');
    const v=p as Record<string, unknown>;
    const keys=['longitudeDeg','latitudeDeg','distanceAu','longitudeSpeedDegDay','latitudeSpeedDegDay','distanceSpeedAuDay'];
    if (v['id'] !== ids[i] || keys.some(k => typeof v[k] !== 'number' || !Number.isFinite(v[k] as number))) throw new Error('invalid_response');
    if ((v['longitudeDeg'] as number) < 0 || (v['longitudeDeg'] as number) >= 360 || Math.abs(v['latitudeDeg'] as number) > 90 || (v['distanceAu'] as number) <= 0) throw new Error('invalid_response');
    return {id:ids[i],longitudeDeg:v['longitudeDeg'] as number,latitudeDeg:v['latitudeDeg'] as number,distanceAu:v['distanceAu'] as number,longitudeSpeedDegDay:v['longitudeSpeedDegDay'] as number,latitudeSpeedDegDay:v['latitudeSpeedDegDay'] as number,distanceSpeedAuDay:v['distanceSpeedAuDay'] as number};
  });
  return {status:'ok',packId:null,jdTdb:x['jdTdb'],positions};
}

export async function calculateDe441(utcIso: string): Promise<De441Result> {
  if (!isTauri()) return {status:'provider_unavailable',packId:null,jdTdb:null,positions:[]};
  try { return decodeDe441Result(await invoke<unknown>('de441_apparent_positions', {request:{protocolVersion:1,utcIso}})); }
  catch { return {status:'calculation_failed',packId:null,jdTdb:null,positions:[]}; }
}
