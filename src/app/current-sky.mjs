import { Body, Ecliptic, EclipticGeoMoon, GeoVector, SunPosition } from 'astronomy-engine';

const ZODIAC = [
  { id: 'aries', glyph: '♈', it: 'Ariete', en: 'Aries' }, { id: 'taurus', glyph: '♉', it: 'Toro', en: 'Taurus' },
  { id: 'gemini', glyph: '♊', it: 'Gemelli', en: 'Gemini' }, { id: 'cancer', glyph: '♋', it: 'Cancro', en: 'Cancer' },
  { id: 'leo', glyph: '♌', it: 'Leone', en: 'Leo' }, { id: 'virgo', glyph: '♍', it: 'Vergine', en: 'Virgo' },
  { id: 'libra', glyph: '♎', it: 'Bilancia', en: 'Libra' }, { id: 'scorpio', glyph: '♏', it: 'Scorpione', en: 'Scorpio' },
  { id: 'sagittarius', glyph: '♐', it: 'Sagittario', en: 'Sagittarius' }, { id: 'capricorn', glyph: '♑', it: 'Capricorno', en: 'Capricorn' },
  { id: 'aquarius', glyph: '♒', it: 'Acquario', en: 'Aquarius' }, { id: 'pisces', glyph: '♓', it: 'Pesci', en: 'Pisces' }
];
const BODIES = [
  { id: 'sun', body: Body.Sun, glyph: '☉', it: 'Sole', en: 'Sun' },
  { id: 'moon', body: Body.Moon, glyph: '☽', it: 'Luna', en: 'Moon' },
  { id: 'mercury', body: Body.Mercury, glyph: '☿', it: 'Mercurio', en: 'Mercury' },
  { id: 'venus', body: Body.Venus, glyph: '♀', it: 'Venere', en: 'Venus' },
  { id: 'mars', body: Body.Mars, glyph: '♂', it: 'Marte', en: 'Mars' },
  { id: 'jupiter', body: Body.Jupiter, glyph: '♃', it: 'Giove', en: 'Jupiter' },
  { id: 'saturn', body: Body.Saturn, glyph: '♄', it: 'Saturno', en: 'Saturn' },
  { id: 'uranus', body: Body.Uranus, glyph: '♅', it: 'Urano', en: 'Uranus' },
  { id: 'neptune', body: Body.Neptune, glyph: '♆', it: 'Nettuno', en: 'Neptune' },
  { id: 'pluto', body: Body.Pluto, glyph: '♇', it: 'Plutone', en: 'Pluto' }
];

const wrap = (value) => ((value % 360) + 360) % 360;

function longitudeFor(body, date) {
  if (body === Body.Sun) return SunPosition(date).elon;
  if (body === Body.Moon) return EclipticGeoMoon(date).lon;
  return Ecliptic(GeoVector(body, date, true)).elon;
}

/**
 * Provider boundary for the current-sky chart.
 * Astronomy Engine is a temporary MIT-licensed provider, replaceable by the
 * verified VirgoStars-Ephemeris adapter without changing the UI DTO.
 * This geocentric MVP deliberately has no Ascendant or house cusps.
 */
export function calculateCurrentSky(instant = new Date()) {
  const date = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid instant is required to calculate the sky chart.');

  const planets = BODIES.map((definition, index) => {
    const longitude = wrap(longitudeFor(definition.body, date));
    const signIndex = Math.floor(longitude / 30);
    const withinSignMinutes = Math.round((longitude - signIndex * 30) * 60);
    const roundedIntoNextSign = withinSignMinutes >= 1800;
    const displaySignIndex = (signIndex + (roundedIntoNextSign ? 1 : 0)) % 12;
    const degree = roundedIntoNextSign ? 0 : Math.floor(withinSignMinutes / 60);
    const minute = roundedIntoNextSign ? 0 : withinSignMinutes % 60;
    const angle = (longitude + 180) * Math.PI / 180;
    const radius = 91 + (index % 3) * 16;
    const sign = ZODIAC[displaySignIndex];

    return {
      id: definition.id, glyph: definition.glyph, nameIt: definition.it, nameEn: definition.en,
      longitude, signIndex: displaySignIndex, signIt: sign.it, signEn: sign.en, signGlyph: sign.glyph,
      degree, minute, x: 160 + radius * Math.cos(angle), y: 160 + radius * Math.sin(angle)
    };
  });

  return {
    instant: date.toISOString(),
    provider: 'Astronomy Engine 2.1.19',
    referenceFrame: 'Geocentric · tropical · true ecliptic of date',
    planets
  };
}

export const ZODIAC_SIGNS = ZODIAC.map(({ id, glyph, it, en }) => ({ id, glyph, it, en }));
