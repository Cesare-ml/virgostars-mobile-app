import { Injectable } from '@angular/core';
import * as Astronomy from 'astronomy-engine';

export interface CurrentSkyBody {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly longitude: number;
  readonly sign: string;
  readonly degreeInSign: number;
  readonly x: number;
  readonly y: number;
}

export interface CurrentSkySnapshot {
  readonly calculatedAt: Date;
  readonly engine: string;
  readonly frame: string;
  readonly bodies: readonly CurrentSkyBody[];
}

const ZODIAC = [
  { name: 'Ariete', glyph: '♈' }, { name: 'Toro', glyph: '♉' },
  { name: 'Gemelli', glyph: '♊' }, { name: 'Cancro', glyph: '♋' },
  { name: 'Leone', glyph: '♌' }, { name: 'Vergine', glyph: '♍' },
  { name: 'Bilancia', glyph: '♎' }, { name: 'Scorpione', glyph: '♏' },
  { name: 'Sagittario', glyph: '♐' }, { name: 'Capricorno', glyph: '♑' },
  { name: 'Acquario', glyph: '♒' }, { name: 'Pesci', glyph: '♓' }
] as const;

const BODIES = [
  { id: 'sun', name: 'Sole', glyph: '☉', body: Astronomy.Body.Sun },
  { id: 'moon', name: 'Luna', glyph: '☽', body: Astronomy.Body.Moon },
  { id: 'mercury', name: 'Mercurio', glyph: '☿', body: Astronomy.Body.Mercury },
  { id: 'venus', name: 'Venere', glyph: '♀', body: Astronomy.Body.Venus },
  { id: 'mars', name: 'Marte', glyph: '♂', body: Astronomy.Body.Mars },
  { id: 'jupiter', name: 'Giove', glyph: '♃', body: Astronomy.Body.Jupiter },
  { id: 'saturn', name: 'Saturno', glyph: '♄', body: Astronomy.Body.Saturn },
  { id: 'uranus', name: 'Urano', glyph: '♅', body: Astronomy.Body.Uranus },
  { id: 'neptune', name: 'Nettuno', glyph: '♆', body: Astronomy.Body.Neptune },
  { id: 'pluto', name: 'Plutone', glyph: '♇', body: Astronomy.Body.Pluto }
] as const;

const normalize = (degrees: number): number => {
  const remainder = degrees % 360;
  return remainder < 0 ? remainder + 360 : remainder === 0 ? 0 : remainder;
};

@Injectable({ providedIn: 'root' })
export class CurrentSkyService {
  calculate(instant: Date = new Date()): CurrentSkySnapshot {
    if (!Number.isFinite(instant.getTime())) {
      throw new RangeError('Invalid calculation instant');
    }

    // Astronomy Engine returns geocentric vectors in J2000 equatorial axes.
    // Rotate those vectors into the true ecliptic of the requested date before
    // deriving tropical longitudes. No local clock or timezone offset is added:
    // JavaScript Date already represents an absolute UTC instant.
    const frame = Astronomy.Rotation_EQJ_ECT(instant);
    const bodies = BODIES.map((item): CurrentSkyBody => {
      const vector = Astronomy.GeoVector(item.body, instant, true);
      const ecliptic = Astronomy.RotateVector(frame, vector);
      if (![ecliptic.x, ecliptic.y, ecliptic.z].every(Number.isFinite) ||
          Math.hypot(ecliptic.x, ecliptic.y, ecliptic.z) === 0) {
        throw new RangeError('Invalid geocentric vector for ' + item.name);
      }
      const longitude = normalize(Math.atan2(ecliptic.y, ecliptic.x) * 180 / Math.PI);
      const signIndex = Math.floor(longitude / 30);
      const degreeInSign = longitude - signIndex * 30;
      // Longitude is the source of truth; glyph layout is applied afterwards.

      return {
        id: item.id,
        name: item.name,
        glyph: item.glyph,
        longitude,
        sign: ZODIAC[signIndex].name,
        degreeInSign,
        x: 0,
        y: 0
      };
    });

    // Spread conjunctions across three concentric tracks without changing
    // their true longitudes. Circular distance handles 359° versus 1°.
    const tracks = [112, 128, 142];
    const occupied: Array<{ x: number; y: number }> = [];
    const placedBodies = [...bodies].sort((a, b) => a.longitude - b.longitude).map((body) => {
      const angle = (body.longitude - 90) * Math.PI / 180;
      const candidates = tracks.map((radius) => ({
        x: 160 + Math.cos(angle) * radius,
        y: 160 + Math.sin(angle) * radius
      }));
      const position = candidates.find(({ x, y }) =>
        occupied.every((other) => Math.hypot(x - other.x, y - other.y) >= 21)
      ) ?? candidates.reduce((best, candidate) => {
        const clearance = (p: { x: number; y: number }): number =>
          occupied.length ? Math.min(...occupied.map((other) => Math.hypot(p.x - other.x, p.y - other.y))) : Infinity;
        return clearance(candidate) > clearance(best) ? candidate : best;
      });
      occupied.push(position);
      return { ...body, ...position };
    });
    const byId = new Map(placedBodies.map((body) => [body.id, body]));
    return {
      calculatedAt: new Date(instant.getTime()),
      engine: 'Astronomy Engine 2.1.19',
      frame: 'Geocentric · eclittica vera della data · longitudine tropicale',
      bodies: bodies.map((body) => byId.get(body.id)!)
    };
  }

  readonly zodiac = ZODIAC;
}
