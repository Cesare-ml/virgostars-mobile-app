/** Experimental diagnostic DTO. Raw geometrical vectors are NOT chart positions. */
export const DE441_PROBE_PROTOCOL_VERSION = 1 as const;

export type De441Body =
  | 'solar_system_barycenter' | 'mercury' | 'venus' | 'earth_moon_barycenter'
  | 'earth' | 'moon' | 'mars_barycenter' | 'jupiter_barycenter'
  | 'saturn_barycenter' | 'uranus_barycenter' | 'neptune_barycenter'
  | 'pluto_barycenter' | 'sun';

export type De441ProbeRequest = Readonly<{
  protocolVersion: 1;
  jdTdb: number;
  target: De441Body;
  center: De441Body;
}>;

export type De441ProbeStatus =
  | 'ok' | 'provider_unavailable' | 'storage_unavailable' | 'invalid_request'
  | 'outside_coverage' | 'missing_pack' | 'invalid_pack' | 'reader_failed';

export type De441ProbeVector = Readonly<{
  positionKm: readonly [number, number, number];
  velocityKmPerDay: readonly [number, number, number];
  frame: 'ICRF/J2000';
  quantity: 'geometric';
  epochScale: 'TDB';
  lengthUnit: 'km';
  speedUnit: 'km/day';
  source: 'de441_classic';
}>;

export type De441ProbeResponse = Readonly<{
  protocolVersion: 1;
  status: De441ProbeStatus;
  selectedPackId: string | null;
  result: De441ProbeVector | null;
}>;

const bodies = new Set<De441Body>([
  'solar_system_barycenter', 'mercury', 'venus', 'earth_moon_barycenter',
  'earth', 'moon', 'mars_barycenter', 'jupiter_barycenter',
  'saturn_barycenter', 'uranus_barycenter', 'neptune_barycenter',
  'pluto_barycenter', 'sun',
]);

const statuses = new Set<De441ProbeStatus>([
  'ok', 'provider_unavailable', 'storage_unavailable', 'invalid_request',
  'outside_coverage', 'missing_pack', 'invalid_pack', 'reader_failed',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function vector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 &&
    value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate));
}

/** JD TDB is provided explicitly; UTC Unix timestamps are not accepted. */
export function createDe441ProbeRequest(jdTdb: number, target: De441Body, center: De441Body): De441ProbeRequest {
  if (!Number.isFinite(jdTdb) || !bodies.has(target) || !bodies.has(center) || target === center) {
    throw new Error('Invalid geometric DE441 probe request');
  }
  return Object.freeze({protocolVersion: DE441_PROBE_PROTOCOL_VERSION, jdTdb, target, center});
}

/** Fail closed on mismatched units, missing provenance or non-finite values. */
export function decodeDe441ProbeResponse(raw: unknown): De441ProbeResponse {
  const response = record(raw);
  if (!response || response.protocolVersion !== DE441_PROBE_PROTOCOL_VERSION ||
    !statuses.has(response.status as De441ProbeStatus) ||
    (response.selectedPackId !== null && (typeof response.selectedPackId !== 'string' ||
      !/^(?:core|history-\d{4}-\d{4}|future-\d{4}-\d{4})$/.test(response.selectedPackId)))) {
    throw new Error('Invalid geometric DE441 probe response');
  }
  const status = response.status as De441ProbeStatus;
  if (status !== 'ok') {
    if (response.result !== null) throw new Error('Invalid DE441 probe failure payload');
    return Object.freeze({
      protocolVersion: DE441_PROBE_PROTOCOL_VERSION,
      status,
      selectedPackId: response.selectedPackId as string | null,
      result: null,
    });
  }
  if (typeof response.selectedPackId !== 'string') throw new Error('DE441 probe must select a pack');
  const result = record(response.result);
  if (!result || !vector3(result.positionKm) || !vector3(result.velocityKmPerDay) ||
    result.frame !== 'ICRF/J2000' || result.quantity !== 'geometric' ||
    result.epochScale !== 'TDB' || result.lengthUnit !== 'km' ||
    result.speedUnit !== 'km/day' || result.source !== 'de441_classic') {
    throw new Error('Invalid DE441 geometric vector or provenance');
  }
  return Object.freeze({
    protocolVersion: DE441_PROBE_PROTOCOL_VERSION,
    status: 'ok',
    selectedPackId: response.selectedPackId,
    result: Object.freeze({
      positionKm: Object.freeze([...result.positionKm]) as unknown as readonly [number, number, number],
      velocityKmPerDay: Object.freeze([...result.velocityKmPerDay]) as unknown as readonly [number, number, number],
      frame: 'ICRF/J2000', quantity: 'geometric', epochScale: 'TDB',
      lengthUnit: 'km', speedUnit: 'km/day', source: 'de441_classic',
    }),
  });
}
