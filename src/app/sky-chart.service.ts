import { Injectable } from '@angular/core';
import * as Astronomy from 'astronomy-engine';

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

    // Astronomy Engine exposes Greenwich sidereal time in hours.
    const localSiderealDegrees = normalizeDegrees(
      Astronomy.SiderealTime(timestamp) * 15 + location.longitude
    );
    const siderealAngle = localSiderealDegrees * Math.PI / 180;
    const rotation = Astronomy.Rotation_EQD_ECT(timestamp).rot;
    const latitude = location.latitude * Math.PI / 180;

    // Transform the observer's zenith vector from true equatorial coordinates
    // (EQD) into the true ecliptic frame (ECT) with the library's own matrix.
    const zenithEquatorial = [
      Math.cos(latitude) * Math.cos(siderealAngle),
      Math.cos(latitude) * Math.sin(siderealAngle),
      Math.sin(latitude)
    ];
    const zenithEcliptic = rotation.map(row =>
      row[0] * zenithEquatorial[0] +
      row[1] * zenithEquatorial[1] +
      row[2] * zenithEquatorial[2]
    );

    // The local horizon intersects the ecliptic at two opposite points.
    let ascendantRadians = Math.atan2(zenithEcliptic[0], -zenithEcliptic[1]);

    // Convert the candidate point back to EQD and retain the eastern crossing.
    const eclipticX = Math.cos(ascendantRadians);
    const eclipticY = Math.sin(ascendantRadians);
    const candidateEquatorial = [
      rotation[0][0] * eclipticX + rotation[1][0] * eclipticY,
      rotation[0][1] * eclipticX + rotation[1][1] * eclipticY,
      rotation[0][2] * eclipticX + rotation[1][2] * eclipticY
    ];
    const eastProjection =
      -Math.sin(siderealAngle) * candidateEquatorial[0] +
      Math.cos(siderealAngle) * candidateEquatorial[1];
    if (eastProjection < 0) ascendantRadians += Math.PI;

    const ascendant = normalizeDegrees(ascendantRadians * 180 / Math.PI);
    const ascendantSignIndex = Math.floor(ascendant / 30);

    const bodies: SkyBody[] = BODIES.map((item, index) => {
      const ecliptic = Astronomy.Ecliptic(
        Astronomy.GeoVector(item.body, timestamp, true)
      );
      const longitude = normalizeDegrees(ecliptic.elon);
      const signIndex = Math.floor(longitude / 30);
      const angle = (longitude - 90) * Math.PI / 180;
      const radius = 91 + (index % 2 === 0 ? 0 : 13);

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

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
