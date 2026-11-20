import { locateLongitudeInHouses, normalize360, zodiacSignIndex } from 'astrological-functions';
import type { ChartSnapshotV1, HouseSystemId } from '../native/chart-calculation-contract';
/** Truncate minutes so a value just below a sign boundary never rounds into the next sign. */
export function formatDegreeInSign(value: number): string {
  const minutes = Math.min(1799, Math.max(0, Math.floor(value * 60)));
  return Math.floor(minutes / 60) + '°' + String(minutes % 60).padStart(2,'0') + "'";
}

export const ZODIAC_NAMES = {
  it: ['Ariete','Toro','Gemelli','Cancro','Leone','Vergine','Bilancia','Scorpione','Sagittario','Capricorno','Acquario','Pesci'],
  en: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'],
} as const;

export type InspectorRow = Readonly<{
  id:string; signIndex:number; degree:string; house:number|null; retrograde:boolean; source:string;
  longitude:number; longitudeSpeed:number; latitude:number; latitudeSpeed:number;
  rightAscension:number; declination:number; distanceAu:number; distanceSpeed:number;
}>;
export type InspectorAxis = Readonly<{id:'AS' | 'DS' | 'MC' | 'IC'; longitude:number; signIndex:number; degree:string; house:number|null}>;

/** The four axes of the selected available house system; no rates are inferred. */
export function chartInspectorAxes(chart: ChartSnapshotV1, system: HouseSystemId | null): InspectorAxis[] {
  const houses = chart.houses.find(h => h.id === system);
  if (!houses) return [];
  const axes = [
    {id:'AS', longitude:houses.ascendantDeg}, {id:'DS', longitude:normalize360(houses.ascendantDeg + 180)},
    {id:'MC', longitude:houses.mcDeg}, {id:'IC', longitude:normalize360(houses.mcDeg + 180)},
  ] as const;
  return axes.map(axis => {
    const signIndex = zodiacSignIndex(axis.longitude);
    let house: number | null = null;
    try { house = locateLongitudeInHouses(axis.longitude, houses.cuspsDeg).house; } catch { /* Invalid cusps have no known house. */ }
    return {...axis, signIndex, degree:formatDegreeInSign(axis.longitude - signIndex * 30), house};
  });
}

/** Derive display facts only from validated provider results and the selected available house system. */
export function chartInspectorRows(chart: ChartSnapshotV1, system: HouseSystemId | null): InspectorRow[] {
  const cusps = chart.houses.find(h => h.id === system)?.cuspsDeg;
  return chart.bodies.map(body => {
    const signIndex = zodiacSignIndex(body.longitudeDeg);
    let house: number | null = null;
    if (cusps) {
      try { house = locateLongitudeInHouses(body.longitudeDeg, cusps).house; } catch { house = null; }
    }
    return { id:body.id, signIndex, degree:formatDegreeInSign(body.longitudeDeg - signIndex * 30),
      house, retrograde:body.longitudeSpeed < 0, source:body.ephemerisSource, longitude:body.longitudeDeg,
      longitudeSpeed:body.longitudeSpeed, latitude:body.latitudeDeg, latitudeSpeed:body.latitudeSpeed,
      rightAscension:body.rightAscensionDeg, declination:body.declinationDeg,
      distanceAu:body.distanceAu, distanceSpeed:body.distanceSpeed };
  });
}
