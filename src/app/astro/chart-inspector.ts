import { locateLongitudeInHouses, zodiacSignIndex } from 'astrological-functions';
import type { ChartSnapshotV1, HouseSystemId } from '../native/chart-calculation-contract';
/** Truncate minutes so a value just below a sign boundary never rounds into the next sign. */
function formatDegreeInSign(value: number): string {
  const minutes = Math.min(1799, Math.max(0, Math.floor(value * 60)));
  return Math.floor(minutes / 60) + '°' + String(minutes % 60).padStart(2,'0') + "'";
}

export const ZODIAC_NAMES = {
  it: ['Ariete','Toro','Gemelli','Cancro','Leone','Vergine','Bilancia','Scorpione','Sagittario','Capricorno','Acquario','Pesci'],
  en: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'],
} as const;

export type InspectorRow = Readonly<{id:string; signIndex:number; degree:string; house:number|null; retrograde:boolean; source:string; longitude:number}>;

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
      house, retrograde:body.longitudeSpeed < 0, source:body.ephemerisSource, longitude:body.longitudeDeg };
  });
}