import { ASTRO_COM_HOUSE_SYSTEM_IDS } from 'astrological-functions/astro-com-house-selector';
import { calculateAstroComHouseFromProvider, type AstroComHouseProviderRequest } from 'astrological-functions/astro-com-house-provider';
import type {ChartBodyId, ChartSnapshotV1, HouseSystemId} from '../native/chart-calculation-contract';
import type {De441Result} from '../native/de441-apparent';

export type NativeHouseAngles = Readonly<{ut1JulianDay:number;ttJulianDay:number;latitudeDeg:number;longitudeDegEast:number;armcDeg:number;ascendantDeg:number;midheavenDeg:number;trueObliquityDeg:number;vertexDeg:number;sunDeclinationDeg:number}>;
export type HouseMethod = Readonly<{id:string;kind:'houses'|'sectors';values:readonly number[];error:string|null}>;
const identity={engineVersion:'8b08341',kernelSetId:'de441-mobile-v1.0.0',timeModel:'UTC_AS_UT1_IERS_TDB_APPROX'} as const;

/** Routes to the existing library methods; never calculates astronomical angles. */
export async function calculateDe441Houses(utc:string, angles:NativeHouseAngles):Promise<readonly HouseMethod[]> {
  const provider={calculateHouseAngles:()=>({...identity,model:'IAU2006_2000B_APPROXIMATE_SIDEREAL_TIME' as const,
    ut1JulianDay:angles.ut1JulianDay,ttJulianDay:angles.ttJulianDay,latitudeDeg:angles.latitudeDeg,longitudeDegEast:angles.longitudeDegEast,
    armcDeg:angles.armcDeg,ascendantDeg:angles.ascendantDeg,midheavenDeg:angles.midheavenDeg,trueObliquityDeg:angles.trueObliquityDeg})};
  const base={datetimeUtc:utc,birthTimeKnown:true as const,ut1JulianDay:angles.ut1JulianDay,ttJulianDay:angles.ttJulianDay,
    latitudeDeg:angles.latitudeDeg,longitudeDegEast:angles.longitudeDegEast,expectedProvider:identity};
  const sun={datetimeUtc:utc,declinationDeg:angles.sunDeclinationDeg,modelId:'IAU2006_2000B_DE441_APPARENT',bodyId:'SUN' as const,
    frame:'EQUATORIAL_OF_DATE' as const,center:'EARTH' as const,corrections:'APPARENT' as const,observerType:'GEOCENTRIC' as const,source:identity};
  const results:HouseMethod[]=[];
  for (const id of ASTRO_COM_HOUSE_SYSTEM_IDS) {
    const kind=id==='GAUQUELIN_36'?'sectors':'houses';
    try {
      const request=(id==='SUNSHINE'?{...base,houseSystem:id,sun}:{...base,houseSystem:id}) as AstroComHouseProviderRequest;
      const result=(await calculateAstroComHouseFromProvider(request,provider)).result;
      const values='sectorBoundariesDeg' in result?result.sectorBoundariesDeg:('cuspsDeg' in result?result.cuspsDeg:[]);
      if (values.length!==(kind==='sectors'?36:12) || values.some(x=>!Number.isFinite(x)||x<0||x>=360)) throw new Error('INVALID_BOUNDARIES');
      results.push({id,kind,values:[...values],error:null});
    } catch (error) {
      const code=(error && typeof error==='object' && 'code' in error && typeof error.code==='string' && /^[A-Z_]{1,64}$/.test(error.code))?error.code:'CALCULATION_UNAVAILABLE';
      results.push({id,kind,values:[],error:code});
    }
  }
  return results;
}

/** Map actual computed data to the existing chart contract; missing items stay unavailable. */
export function makeDe441Chart(result:De441Result, angles:NativeHouseAngles, methods:readonly HouseMethod[]):ChartSnapshotV1 {
  const bodyIds:ChartBodyId[]=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
  const bodies=result.positions.map((p,i)=>({id:bodyIds[i],longitudeDeg:p.longitudeDeg,latitudeDeg:p.latitudeDeg,distanceAu:p.distanceAu,
    longitudeSpeed:p.longitudeSpeedDegDay,latitudeSpeed:p.latitudeSpeedDegDay,distanceSpeed:p.distanceSpeedAuDay,
    rightAscensionDeg:p.rightAscensionDeg,declinationDeg:p.declinationDeg,ephemerisSource:'jpl' as const}));
  const houses=methods.filter(m=>m.kind==='houses'&&!m.error).map(m=>({id:m.id as HouseSystemId,cuspsDeg:m.values,
    ascendantDeg:angles.ascendantDeg,mcDeg:angles.midheavenDeg,armcDeg:angles.armcDeg,vertexDeg:angles.vertexDeg}));
  const unavailableHouseSystems=methods.filter(m=>m.kind==='houses'&&m.error).map(m=>m.id as HouseSystemId);
  return {julianDayUt:angles.ut1JulianDay,bodies,houses,unavailableBodies:['mean Node','true Node','mean Apogee','osc. Apogee','Chiron'],unavailableHouseSystems};
}
