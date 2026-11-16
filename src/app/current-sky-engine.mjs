import { Body, Ecliptic, EclipticGeoMoon, GeoVector } from 'astronomy-engine';

export const CURRENT_SKY_ENGINE = 'Astronomy Engine 2.1.19';
export const CURRENT_SKY_REFRESH_MS = 60_000;

const BODY_DEFINITIONS = Object.freeze([
  { id: 'sun', name: 'Sole', glyph: '☉', body: Body.Sun },
  { id: 'moon', name: 'Luna', glyph: '☽', body: Body.Moon },
  { id: 'mercury', name: 'Mercurio', glyph: '☿', body: Body.Mercury },
  { id: 'venus', name: 'Venere', glyph: '♀', body: Body.Venus },
  { id: 'mars', name: 'Marte', glyph: '♂', body: Body.Mars },
  { id: 'jupiter', name: 'Giove', glyph: '♃', body: Body.Jupiter },
  { id: 'saturn', name: 'Saturno', glyph: '♄', body: Body.Saturn },
  { id: 'uranus', name: 'Urano', glyph: '♅', body: Body.Uranus },
  { id: 'neptune', name: 'Nettuno', glyph: '♆', body: Body.Neptune },
  { id: 'pluto', name: 'Plutone', glyph: '♇', body: Body.Pluto }
]);

export const ZODIAC_SIGNS_IT = Object.freeze([
  'Ariete', 'Toro', 'Gemelli', 'Cancro', 'Leone', 'Vergine',
  'Bilancia', 'Scorpione', 'Sagittario', 'Capricorno', 'Acquario', 'Pesci'
]);

export const ZODIAC_GLYPHS = Object.freeze([
  '♈', '♉', '♊', '♋', '♌', '♍',
  '♎', '♏', '♐', '♑', '♒', '♓'
]);

function normalizeDegrees(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function makePosition(definition, longitudeDeg, latitudeDeg) {
  const longitude = normalizeDegrees(longitudeDeg);
  const signIndex = Math.floor(longitude / 30);
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    glyph: definition.glyph,
    longitudeDeg: longitude,
    latitudeDeg,
    signIndex,
    sign: ZODIAC_SIGNS_IT[signIndex],
    degreeInSign: longitude - signIndex * 30
  });
}

/**
 * Calculates a current, geocentric chart snapshot from a real UTC instant.
 *
 * Positions are geocentric true-ecliptic-of-date coordinates. Planet vectors use\n * light-time and aberration corrections; the Moon uses its dedicated lunar theory.
 * The app intentionally does not fabricate houses or angles: they require a
 * validated observer-angle pipeline and will be added after that contract lands.
 */
export function calculateCurrentSky(instant = new Date()) {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    throw new TypeError('A valid JavaScript Date is required');
  }

  const bodies = BODY_DEFINITIONS.map(definition => {
    if (definition.id === 'moon') {
      const moon = EclipticGeoMoon(instant);
      return makePosition(definition, moon.lon, moon.lat);
    }

    const equatorialJ2000 = GeoVector(definition.body, instant, true);
    const eclipticOfDate = Ecliptic(equatorialJ2000);
    return makePosition(definition, eclipticOfDate.elon, eclipticOfDate.elat);
  });

  return Object.freeze({
    contract: 'VirgoStarsCurrentSky',
    schemaVersion: 1,
    datetimeUtc: instant.toISOString(),
    coordinateCenter: 'EARTH',
    coordinateFrame: 'ECLIPTIC_OF_DATE',
    positionType: 'GEOCENTRIC',
    zodiac: 'TROPICAL',
    engine: CURRENT_SKY_ENGINE,
    refreshIntervalMs: CURRENT_SKY_REFRESH_MS,
    bodies: Object.freeze(bodies)
  });
}
