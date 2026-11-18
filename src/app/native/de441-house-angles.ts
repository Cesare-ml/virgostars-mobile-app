import {invoke,isTauri} from '@tauri-apps/api/core';
import type {NativeHouseAngles} from '../astro/de441-house-systems';

export type HouseAnglesResult = Readonly<{status:string; angles:NativeHouseAngles|null;packId:string|null}>;
export async function getDe441HouseAngles(utcIso:string,latMicro:number,lngMicro:number):Promise<HouseAnglesResult> {
  if (!isTauri()) return {status:'provider_unavailable',angles:null,packId:null};
  try {
    const raw=await invoke<unknown>('de441_house_angles',{request:{protocolVersion:1,utcIso,latMicro,lngMicro}});
    if (!raw || typeof raw!=='object') throw new Error('invalid_response');
    const r=raw as Record<string,unknown>;
    if (r['protocolVersion']!==1 || typeof r['status']!=='string') throw new Error('invalid_response');
    if (r['status']!=='ok') {
      const allowed=['invalid_request','invalid_site','unsupported_utc','outside_coverage','missing_pack','invalid_pack','provider_unavailable','storage_unavailable','calculation_failed'];
      if (!allowed.includes(r['status']) || r['angles']!==null || (r['packId']!==null && r['packId']!=='core')) throw new Error('invalid_response');
      return {status:r['status'],angles:null,packId:r['packId'] as string|null};
    }
    if (!r['angles'] || typeof r['angles']!=='object' || r['packId']!==null) throw new Error('invalid_response');
    const a=r['angles'] as Record<string,unknown>;
    const keys=['ut1JulianDay','ttJulianDay','latitudeDeg','longitudeDegEast','armcDeg','ascendantDeg','midheavenDeg','trueObliquityDeg','vertexDeg','sunDeclinationDeg'];
    if (keys.some(k=>typeof a[k]!=='number'||!Number.isFinite(a[k] as number))) throw new Error('invalid_response');
    if (a['latitudeDeg']!==latMicro/1e6 || a['longitudeDegEast']!==lngMicro/1e6) throw new Error('invalid_response');
    return {status:'ok',angles:a as NativeHouseAngles,packId:null};
  } catch { return {status:'calculation_failed',angles:null,packId:null}; }
}
