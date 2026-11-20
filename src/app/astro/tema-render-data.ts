/**
 * Turns one validated chart snapshot into the data shape the Charts renderer
 * draws. Zodiac arithmetic and house placement come from astrological-functions;
 * positions come from the snapshot. Nothing is estimated here: a body or house
 * system the provider did not compute is simply absent.
 */
import {
  dodecatemoriaLongitude, locateLongitudeInHouses, normalize360, zodiacSignIndex,
} from 'astrological-functions';
import type {
  ChartBodyV1, ChartHouseSystemV1, ChartSnapshotV1, HouseSystemId,
} from '../native/chart-calculation-contract';

export type RenderPlanet = {
  name: string;
  longitude: number;
  latitude: number;
  distance: number;
  longitudeSpeed: number;
  latitudeSpeed: number;
  distanceSpeed: number;
  longitudeSign: number;
  longitude30: number;
  equatoriale: {rectAscension: number; declination: number};
  dodecatemoria?: {longitude: number; longitudeSpeed: number; longitudeSign: number; longitude30: number};
};

export type RenderHouseSystem = {
  house: number[];
  ascendant: number;
  mc: number;
  armc: number;
  vertex: number;
  ds: number;
  ic: number;
};

export type TemaRenderData = {
  dataora: string;
  as: number;
  ds: number;
  mc: number;
  ic: number;
  planets: Record<string, RenderPlanet>;
  houses: Record<string, RenderHouseSystem>;
  australInversion: boolean;
  fasiSinodiche: Record<string, never>;
  fasiSinodicheLatitudinali: Record<string, never>;
  lunazioniErmetiche: Record<string, never>;
  astrologiaOraria: Record<string, never>;
  orePlanetarie: Record<string, never>;
  partiArabe: Record<string, never>;
};

/** The seven traditional bodies carry a dodecatemorion. */
const TRADITIONAL = new Set(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']);

/** Points defined as the exact opposite of a computed one. */
const OPPOSITES: ReadonlyArray<readonly [string, string]> = [
  ['true Node Sud', 'true Node'],
  ['mean Node Sud', 'mean Node'],
  ['osc. Perigee', 'osc. Apogee'],
  ['mean Perigee', 'mean Apogee'],
];

function zodiacParts(longitude: number): {longitudeSign: number; longitude30: number} {
  const longitudeSign = zodiacSignIndex(longitude);
  return {longitudeSign, longitude30: longitude - longitudeSign * 30};
}

function planet(body: ChartBodyV1): RenderPlanet {
  const result: RenderPlanet = {
    name: body.id,
    longitude: body.longitudeDeg,
    latitude: body.latitudeDeg,
    distance: body.distanceAu,
    longitudeSpeed: body.longitudeSpeed,
    latitudeSpeed: body.latitudeSpeed,
    distanceSpeed: body.distanceSpeed,
    ...zodiacParts(body.longitudeDeg),
    equatoriale: {rectAscension: body.rightAscensionDeg, declination: body.declinationDeg},
  };
  if (TRADITIONAL.has(body.id)) {
    const longitude = dodecatemoriaLongitude(body.longitudeDeg);
    result.dodecatemoria = {longitude, longitudeSpeed: body.longitudeSpeed, ...zodiacParts(longitude)};
  }
  return result;
}

function opposite(name: string, source: RenderPlanet): RenderPlanet {
  const longitude = normalize360(source.longitude + 180);
  return {
    name,
    longitude,
    latitude: -source.latitude,
    distance: source.distance,
    longitudeSpeed: source.longitudeSpeed,
    latitudeSpeed: -source.latitudeSpeed,
    distanceSpeed: source.distanceSpeed,
    ...zodiacParts(longitude),
    equatoriale: {
      rectAscension: normalize360(source.equatoriale.rectAscension + 180),
      declination: -source.equatoriale.declination,
    },
  };
}

function houseSystem(system: ChartHouseSystemV1): RenderHouseSystem {
  return {
    house: [...system.cuspsDeg],
    ascendant: system.ascendantDeg,
    mc: system.mcDeg,
    armc: system.armcDeg,
    vertex: system.vertexDeg,
    ds: normalize360(system.ascendantDeg + 180),
    ic: normalize360(system.mcDeg + 180),
  };
}

/**
 * Returns null when the snapshot has no house system at all: without an
 * Ascendant the renderer cannot orient the wheel, and none is invented.
 */
export function buildTemaRenderData(chart: ChartSnapshotV1, utcIso: string): TemaRenderData | null {
  const first = chart.houses[0];
  if (!first) return null;
  const planets: Record<string, RenderPlanet> = {};
  for (const body of chart.bodies) planets[body.id] = planet(body);
  for (const [name, sourceName] of OPPOSITES) {
    const source = planets[sourceName];
    if (source) planets[name] = opposite(name, source);
  }
  const houses: Record<string, RenderHouseSystem> = {};
  for (const system of chart.houses) houses[system.id] = houseSystem(system);
  // The four angles do not depend on the house system.
  const angles = houseSystem(first);
  return {
    dataora: utcIso,
    as: angles.ascendant, ds: angles.ds, mc: angles.mc, ic: angles.ic,
    planets, houses,
    australInversion: false,
    fasiSinodiche: {}, fasiSinodicheLatitudinali: {}, lunazioniErmetiche: {},
    astrologiaOraria: {}, orePlanetarie: {}, partiArabe: {},
  };
}

export type PlanetRow = Readonly<{
  name: string;
  longitude: number;
  signIndex: number;
  degreeInSign: number;
  retrograde: boolean;
  house: number | null;
}>;

/** Inspector rows in the order the snapshot lists them, opposites last. */
export function planetRows(data: TemaRenderData, system: HouseSystemId): PlanetRow[] {
  const cusps = data.houses[system]?.house;
  return Object.values(data.planets).map(body => {
    let house: number | null = null;
    if (cusps) {
      try { house = locateLongitudeInHouses(body.longitude, cusps).house; } catch { house = null; }
    }
    return Object.freeze({
      name: body.name,
      longitude: body.longitude,
      signIndex: body.longitudeSign,
      degreeInSign: body.longitude30,
      retrograde: body.longitudeSpeed < 0,
      house,
    });
  });
}

/** Display only dodecatemoria actually derived for the traditional planets. */
export function dodecatemoriaRows(data: TemaRenderData, system: HouseSystemId | null): Omit<PlanetRow, 'retrograde'>[] {
  const cusps = system ? data.houses[system]?.house : undefined;
  return Object.values(data.planets).flatMap(body => {
    const point = body.dodecatemoria;
    if (!point) return [];
    let house: number | null = null;
    if (cusps) {
      try { house = locateLongitudeInHouses(point.longitude, cusps).house; } catch { /* No inferred house. */ }
    }
    return [{name: body.name, longitude: point.longitude, signIndex: point.longitudeSign,
      degreeInSign: point.longitude30, house}];
  });
}

export function availableHouseSystems(data: TemaRenderData): HouseSystemId[] {
  return Object.keys(data.houses) as HouseSystemId[];
}

/** `12°34'` within a sign; minutes are truncated, never rounded up to 60. */
export function formatDegreeInSign(degreeInSign: number): string {
  const totalMinutes = Math.floor(degreeInSign * 60 + 1e-9);
  const degrees = Math.floor(totalMinutes / 60);
  return degrees + '°' + String(totalMinutes % 60).padStart(2, '0') + "'";
}
