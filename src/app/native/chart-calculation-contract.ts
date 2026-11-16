/**
 * Chart-calculation contract shared with the Rust `calculate_chart` command.
 * One UTC instant and one position go in; positions and house cusps come out.
 * Nothing here is astronomy: every value is validated and copied, never derived.
 */
export const CHART_BODY_IDS = Object.freeze([
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'mean Node', 'true Node', 'mean Apogee', 'osc. Apogee', 'Chiron',
] as const);
export type ChartBodyId = typeof CHART_BODY_IDS[number];

export const HOUSE_SYSTEM_IDS = Object.freeze(['egizia', 'placido', 'koch', 'regio-montano', 'porfirio'] as const);
export type HouseSystemId = typeof HOUSE_SYSTEM_IDS[number];

export type EphemerisSource = 'moshier' | 'swiss_files' | 'jpl';

export type ChartBodyV1 = Readonly<{
  id: ChartBodyId;
  longitudeDeg: number;
  latitudeDeg: number;
  distanceAu: number;
  longitudeSpeed: number;
  latitudeSpeed: number;
  distanceSpeed: number;
  rightAscensionDeg: number;
  declinationDeg: number;
  ephemerisSource: EphemerisSource;
}>;

export type ChartHouseSystemV1 = Readonly<{
  id: HouseSystemId;
  cuspsDeg: readonly number[];
  ascendantDeg: number;
  mcDeg: number;
  armcDeg: number;
  vertexDeg: number;
}>;

export type ChartSnapshotV1 = Readonly<{
  julianDayUt: number;
  bodies: readonly ChartBodyV1[];
  houses: readonly ChartHouseSystemV1[];
  unavailableBodies: readonly ChartBodyId[];
  unavailableHouseSystems: readonly HouseSystemId[];
}>;

export type ChartProviderV1 = Readonly<{id: string; engineVersion: string}>;

export type ChartRequestV1 = Readonly<{utcIso: string; latMicro: number; lngMicro: number}>;

export type ChartCalculationResult =
  | Readonly<{kind: 'ready'; provider: ChartProviderV1; chart: ChartSnapshotV1}>
  | Readonly<{kind: 'not_native' | 'provider_unavailable' | 'invalid_request' | 'calculation_failed' | 'unavailable'}>;

export interface ChartCalculationTransport {
  isNative(): boolean;
  invoke(
    command: 'calculate_chart',
    args: {request: {protocolVersion: 1; utcIso: string; latMicro: number; lngMicro: number}},
  ): Promise<unknown>;
}

const PROTOCOL_ERROR = 'Invalid chart calculation protocol';
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SOURCES: readonly string[] = ['moshier', 'swiss_files', 'jpl'];

function plainObject(x: unknown): x is Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const prototype = Object.getPrototypeOf(x);
  return prototype === Object.prototype || prototype === null;
}

/** Read one own data property: never a getter, never an inherited value. */
function field(source: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, name);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(PROTOCOL_ERROR);
  return descriptor.value;
}

function denseArray(x: unknown, maxLength: number): unknown[] {
  if (!Array.isArray(x) || Object.getPrototypeOf(x) !== Array.prototype || x.length > maxLength ||
      Reflect.ownKeys(x).length !== x.length + 1) {
    throw new Error(PROTOCOL_ERROR);
  }
  return Array.from({length: x.length}, (_, index) => field(x, String(index)));
}

function finite(x: unknown, min: number, max: number): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Error(PROTOCOL_ERROR);
  return x;
}

/** Longitudes and right ascensions: `0 <= value < 360`. */
function circle(x: unknown): number {
  const value = finite(x, 0, 360);
  if (value === 360) throw new Error(PROTOCOL_ERROR);
  return value;
}

function member<T extends string>(x: unknown, allowed: readonly T[], seen: Set<string>): T {
  if (typeof x !== 'string' || !(allowed as readonly string[]).includes(x) || seen.has(x)) {
    throw new Error(PROTOCOL_ERROR);
  }
  seen.add(x);
  return x as T;
}

function decodeBody(raw: unknown, seen: Set<string>): ChartBodyV1 {
  if (!plainObject(raw)) throw new Error(PROTOCOL_ERROR);
  const source = field(raw, 'ephemerisSource');
  if (typeof source !== 'string' || !SOURCES.includes(source)) throw new Error(PROTOCOL_ERROR);
  return Object.freeze({
    id: member(field(raw, 'id'), CHART_BODY_IDS, seen),
    longitudeDeg: circle(field(raw, 'longitudeDeg')),
    latitudeDeg: finite(field(raw, 'latitudeDeg'), -90, 90),
    distanceAu: finite(field(raw, 'distanceAu'), 0, 1000),
    longitudeSpeed: finite(field(raw, 'longitudeSpeed'), -30, 30),
    latitudeSpeed: finite(field(raw, 'latitudeSpeed'), -30, 30),
    distanceSpeed: finite(field(raw, 'distanceSpeed'), -10, 10),
    rightAscensionDeg: circle(field(raw, 'rightAscensionDeg')),
    declinationDeg: finite(field(raw, 'declinationDeg'), -90, 90),
    ephemerisSource: source as EphemerisSource,
  });
}

function decodeHouseSystem(raw: unknown, seen: Set<string>): ChartHouseSystemV1 {
  if (!plainObject(raw)) throw new Error(PROTOCOL_ERROR);
  const cusps = denseArray(field(raw, 'cuspsDeg'), 12);
  if (cusps.length !== 12) throw new Error(PROTOCOL_ERROR);
  return Object.freeze({
    id: member(field(raw, 'id'), HOUSE_SYSTEM_IDS, seen),
    cuspsDeg: Object.freeze(cusps.map(circle)),
    ascendantDeg: circle(field(raw, 'ascendantDeg')),
    mcDeg: circle(field(raw, 'mcDeg')),
    armcDeg: circle(field(raw, 'armcDeg')),
    vertexDeg: circle(field(raw, 'vertexDeg')),
  });
}

type DecodedResponse =
  | Readonly<{status: 'ok'; provider: ChartProviderV1; chart: ChartSnapshotV1}>
  | Readonly<{status: 'provider_unavailable' | 'invalid_request' | 'calculation_failed'}>;

/** Detached, frozen values from one native response; throws a generic error otherwise. */
export function decodeChartResponse(raw: unknown): DecodedResponse {
  try {
    if (!plainObject(raw) || field(raw, 'protocolVersion') !== 1) throw new Error(PROTOCOL_ERROR);
    const status = field(raw, 'status');
    if (status === 'provider_unavailable' || status === 'invalid_request' || status === 'calculation_failed') {
      return Object.freeze({status});
    }
    if (status !== 'ok') throw new Error(PROTOCOL_ERROR);

    const provider = field(raw, 'provider');
    if (!plainObject(provider)) throw new Error(PROTOCOL_ERROR);
    const providerId = field(provider, 'id');
    const engineVersion = field(provider, 'engineVersion');
    if (typeof providerId !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(providerId) ||
        typeof engineVersion !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(engineVersion)) {
      throw new Error(PROTOCOL_ERROR);
    }

    const chart = field(raw, 'chart');
    if (!plainObject(chart)) throw new Error(PROTOCOL_ERROR);
    const bodyIds = new Set<string>();
    const bodies = denseArray(field(chart, 'bodies'), CHART_BODY_IDS.length).map(body => decodeBody(body, bodyIds));
    const houseIds = new Set<string>();
    const houses = denseArray(field(chart, 'houses'), HOUSE_SYSTEM_IDS.length)
      .map(system => decodeHouseSystem(system, houseIds));
    // A body or system is either computed or listed as unavailable, never both.
    const unavailableBodies = denseArray(field(chart, 'unavailableBodies'), CHART_BODY_IDS.length)
      .map(id => member(id, CHART_BODY_IDS, bodyIds));
    const unavailableHouseSystems = denseArray(field(chart, 'unavailableHouseSystems'), HOUSE_SYSTEM_IDS.length)
      .map(id => member(id, HOUSE_SYSTEM_IDS, houseIds));
    if (!bodyIds.has('Sun') || !bodyIds.has('Moon') ||
        unavailableBodies.includes('Sun') || unavailableBodies.includes('Moon')) {
      throw new Error(PROTOCOL_ERROR);
    }
    return Object.freeze({
      status: 'ok',
      provider: Object.freeze({id: providerId, engineVersion}),
      chart: Object.freeze({
        julianDayUt: finite(field(chart, 'julianDayUt'), 2_300_000, 2_600_000),
        bodies: Object.freeze(bodies),
        houses: Object.freeze(houses),
        unavailableBodies: Object.freeze(unavailableBodies),
        unavailableHouseSystems: Object.freeze(unavailableHouseSystems),
      }),
    });
  } catch {
    // Never surface native details, accessor or Proxy trap messages.
    throw new Error(PROTOCOL_ERROR);
  }
}

export function validChartRequest(request: ChartRequestV1): boolean {
  return typeof request?.utcIso === 'string' && UTC_PATTERN.test(request.utcIso) &&
    Number.isSafeInteger(request.latMicro) && Math.abs(request.latMicro) <= 90_000_000 &&
    Number.isSafeInteger(request.lngMicro) && Math.abs(request.lngMicro) <= 180_000_000;
}

/**
 * One native call per request. The caller decides which answer is still wanted;
 * failures are reduced to a small set of states and never carry birth data.
 */
export async function requestChart(
  transport: ChartCalculationTransport,
  request: ChartRequestV1,
): Promise<ChartCalculationResult> {
  if (!validChartRequest(request)) return {kind: 'invalid_request'};
  try {
    if (!transport.isNative()) return {kind: 'not_native'};
    const raw = await transport.invoke('calculate_chart', {
      request: {protocolVersion: 1, utcIso: request.utcIso, latMicro: request.latMicro, lngMicro: request.lngMicro},
    });
    const decoded = decodeChartResponse(raw);
    return decoded.status === 'ok'
      ? {kind: 'ready', provider: decoded.provider, chart: decoded.chart}
      : {kind: decoded.status};
  } catch {
    return {kind: 'unavailable'};
  }
}
