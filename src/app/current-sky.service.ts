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

const normalize = (degrees: number): number => ((degrees % 360) + 360) % 360;

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
    const bodies = BODIES.map((item, index): CurrentSkyBody => {
      const vector = Astronomy.GeoVector(item.body, instant, true);
      const ecliptic = Astronomy.RotateVector(frame, vector);
      const longitude = normalize(Math.atan2(ecliptic.y, ecliptic.x) * 180 / Math.PI);
      const signIndex = Math.floor(longitude / 30);
      const degreeInSign = longitude - signIndex * 30;
      const radius = index < 2 ? 115 : index % 2 === 0 ? 137 : 151;
      const angle = (longitude - 90) * Math.PI / 180;

      return {
        id: item.id,
        name: item.name,
        glyph: item.glyph,
        longitude,
        sign: ZODIAC[signIndex].name,
        degreeInSign,
        x: 160 + Math.cos(angle) * radius,
        y: 160 + Math.sin(angle) * radius
      };
    });

    return {
      calculatedAt: new Date(instant.getTime()),
      engine: 'Astronomy Engine 2.1.19',
      frame: 'Geocentric · eclittica vera della data · longitudine tropicale',
      bodies
    };
  }

  readonly zodiac = ZODIAC;
}
