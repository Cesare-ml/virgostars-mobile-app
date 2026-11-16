import { Injectable } from '@angular/core';
import * as Astronomy from 'astronomy-engine';
import { calculateAscendant, normalizeDegrees } from './sky-chart-math.js';

export interface ObserverLocation {
  latitude: number;
  longitude: number;
  source: 'device' | 'manual';
}

export interface SkyBody {
  id: string;
  name: string;
  symbol: string;
  longitude: number;
  latitude: number;
  signIndex: number;
  sign: string;
  degreeInSign: number;
  house: number;
  x: number;
  y: number;
}

export interface SkyChart {
  timestamp: Date;
  location: ObserverLocation;
  ascendant: number;
  ascendantSign: string;
  ascendantDegree: number;
  bodies: SkyBody[];
  engine: string;
  houseSystem: string;
  zodiac: string;
}

const SIGNS = [
  'Ariete', 'Toro', 'Gemelli', 'Cancro', 'Leone', 'Vergine',
  'Bilancia', 'Scorpione', 'Sagittario', 'Capricorno', 'Acquario', 'Pesci'
] as const;

const BODIES = [
  { id: 'sun', name: 'Sole', symbol: '☉', body: Astronomy.Body.Sun },
  { id: 'moon', name: 'Luna', symbol: '☽', body: Astronomy.Body.Moon },
  { id: 'mercury', name: 'Mercurio', symbol: '☿', body: Astronomy.Body.Mercury },
  { id: 'venus', name: 'Venere', symbol: '♀', body: Astronomy.Body.Venus },
  { id: 'mars', name: 'Marte', symbol: '♂', body: Astronomy.Body.Mars },
  { id: 'jupiter', name: 'Giove', symbol: '♃', body: Astronomy.Body.Jupiter },
  { id: 'saturn', name: 'Saturno', symbol: '♄', body: Astronomy.Body.Saturn },
  { id: 'uranus', name: 'Urano', symbol: '♅', body: Astronomy.Body.Uranus },
  { id: 'neptune', name: 'Nettuno', symbol: '♆', body: Astronomy.Body.Neptune },
  { id: 'pluto', name: 'Plutone', symbol: '♇', body: Astronomy.Body.Pluto }
] as const;

const CENTER_X = 160;
const CENTER_Y = 160;

/** Spread neighboring planet glyphs across concentric lanes without changing longitude. */
export function planetGlyphRadius(longitude: number, prior: ReadonlyArray<{ longitude: number; radius: number }>): number {
  const lanes = [91, 105, 77, 116];
  const separation = 15;
  for (const radius of lanes) {
    const clear = prior.every(point => {
      const delta = Math.abs(((longitude - point.longitude + 540) % 360) - 180);
      const a = longitude * Math.PI / 180;
      const b = point.longitude * Math.PI / 180;
      const distance = Math.sqrt(radius * radius + point.radius * point.radius - 2 * radius * point.radius * Math.cos(a - b));
      return delta >= 30 || distance >= separation;
    });
    if (clear) return radius;
  }
  return lanes[prior.length % lanes.length];
}


/**
 * Temporary astronomy provider. Keep this adapter isolated so it can be
 * replaced by the validated VirgoStars Rust engine without changing the UI.
 */
@Injectable({ providedIn: 'root' })
export class SkyChartService {
  calculate(timestamp: Date, location: ObserverLocation): SkyChart {
    if (!Number.isFinite(timestamp.getTime())) {
      throw new Error('Invalid observation time');
    }

    if (
      !Number.isFinite(location.latitude) ||
      Math.abs(location.latitude) > 90 ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.longitude) > 180
    ) {
      throw new Error('Invalid geographic coordinates');
    }

    const localSiderealDegrees = normalizeDegrees(
      Astronomy.SiderealTime(timestamp) * 15 + location.longitude
    );
    const rotation = Astronomy.Rotation_EQD_ECT(timestamp).rot;
    const ascendant = calculateAscendant(
      rotation,
      location.latitude,
      localSiderealDegrees
    ).longitudeDegrees;
    const ascendantSignIndex = Math.floor(ascendant / 30);

    const placed: Array<{ longitude: number; radius: number }> = [];
    const bodies: SkyBody[] = BODIES.map(item => {
      const ecliptic = Astronomy.Ecliptic(
        Astronomy.GeoVector(item.body, timestamp, true)
      );
      const longitude = normalizeDegrees(ecliptic.elon);
      const signIndex = Math.floor(longitude / 30);
      const angle = (longitude - 90) * Math.PI / 180;
      const radius = planetGlyphRadius(longitude, placed);
      placed.push({ longitude, radius });

      return {
        id: item.id,
        name: item.name,
        symbol: item.symbol,
        longitude,
        latitude: ecliptic.elat,
        signIndex,
        sign: SIGNS[signIndex],
        degreeInSign: longitude - signIndex * 30,
        house: ((signIndex - ascendantSignIndex + 12) % 12) + 1,
        x: CENTER_X + radius * Math.cos(angle),
        y: CENTER_Y + radius * Math.sin(angle)
      };
    });

    return {
      timestamp: new Date(timestamp),
      location: { ...location },
      ascendant,
      ascendantSign: SIGNS[ascendantSignIndex],
      ascendantDegree: ascendant - ascendantSignIndex * 30,
      bodies,
      engine: 'Astronomy Engine 2.1.19 (MIT, temporaneo)',
      houseSystem: 'Whole Sign',
      zodiac: 'Tropicale'
    };
  }

  readonly signs = SIGNS.map((name, index) => ({
    index,
    name: name.slice(0, 3),
    x: CENTER_X + 135 * Math.cos((index * 30 + 15 - 90) * Math.PI / 180),
    y: CENTER_Y + 135 * Math.sin((index * 30 + 15 - 90) * Math.PI / 180)
  }));
}
