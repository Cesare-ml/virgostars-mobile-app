import { Injectable } from '@angular/core';
import * as Astronomy from 'astronomy-engine';

export interface ZodiacSign { id: string; glyph: string; }
export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  { id: 'aries', glyph: '♈' }, { id: 'taurus', glyph: '♉' },
  { id: 'gemini', glyph: '♊' }, { id: 'cancer', glyph: '♋' },
  { id: 'leo', glyph: '♌' }, { id: 'virgo', glyph: '♍' },
  { id: 'libra', glyph: '♎' }, { id: 'scorpio', glyph: '♏' },
  { id: 'sagittarius', glyph: '♐' }, { id: 'capricorn', glyph: '♑' },
  { id: 'aquarius', glyph: '♒' }, { id: 'pisces', glyph: '♓' }
];

const BODIES = [
  { id: 'Sun', glyph: '☉', body: Astronomy.Body.Sun },
  { id: 'Moon', glyph: '☽', body: Astronomy.Body.Moon },
  { id: 'Mercury', glyph: '☿', body: Astronomy.Body.Mercury },
  { id: 'Venus', glyph: '♀', body: Astronomy.Body.Venus },
  { id: 'Mars', glyph: '♂', body: Astronomy.Body.Mars },
  { id: 'Jupiter', glyph: '♃', body: Astronomy.Body.Jupiter },
  { id: 'Saturn', glyph: '♄', body: Astronomy.Body.Saturn },
  { id: 'Uranus', glyph: '♅', body: Astronomy.Body.Uranus },
  { id: 'Neptune', glyph: '♆', body: Astronomy.Body.Neptune },
  { id: 'Pluto', glyph: '♇', body: Astronomy.Body.Pluto }
] as const;

export interface SkyBody {
  id: string; glyph: string; longitude: number;
  signIndex: number; signDegree: number; retrograde: boolean | null;
}
export interface SkySnapshot {
  instant: Date;
  coordinateFrame: 'TRUE_ECLIPTIC_OF_DATE';
  zodiac: 'TROPICAL';
  observer: 'GEOCENTRIC';
  provider: 'ASTRONOMY_ENGINE_TEMPORARY';
  bodies: SkyBody[];
}

/** Replaceable local provider for the first MVP.
 * GeoVector + Ecliptic yields apparent geocentric ecliptic-of-date coordinates.
 * No house cusps or Ascendant are inferred without an observer location.
 */
@Injectable({ providedIn: 'root' })
export class LiveSkyService {
  calculate(instant: Date): SkySnapshot {
    if (Number.isNaN(instant.getTime())) throw new TypeError('A valid observation instant is required.');
    const bodies = BODIES.map(({ id, glyph, body }) => {
      const equatorial = Astronomy.GeoVector(body, instant, true);
      const ecliptic = Astronomy.Ecliptic(equatorial);
      const longitude = normalizeDegrees(ecliptic.elon);
      return { id, glyph, longitude, signIndex: Math.floor(longitude / 30), signDegree: longitude % 30, retrograde: null };
    }).sort((a, b) => a.longitude - b.longitude);
    return {
      instant: new Date(instant.getTime()),
      coordinateFrame: 'TRUE_ECLIPTIC_OF_DATE',
      zodiac: 'TROPICAL',
      observer: 'GEOCENTRIC',
      provider: 'ASTRONOMY_ENGINE_TEMPORARY',
      bodies
    };
  }
}
function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
