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
  | 'outside_coverage' | 'missing_pack' | 'invalid_pack' | 'reader_failed'
  | 'unsupported_utc';

export type De441CivilProbeRequest = Readonly<{
  protocolVersion: 1;
  timestamp: string;
  target: De441Body;
  center: De441Body;
}>;

export type De441CivilTimeConversion = Readonly<{
  jdTdb: number;
  model: 'IERS_LEAP_SECONDS_USNO_TRUNCATED_TDB_TT';
  accuracy: 'approximate';
  utcCoverage: '1972-01-01/2027-06-27';
  source: 'virgostars_ephemeris_core';
}>;

export type De441CivilProbeResponse = De441ProbeResponse & Readonly<{
  conversion: De441CivilTimeConversion | null;
}>;

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
  'unsupported_utc',
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

/** Syntax validation only. Calendar, leap seconds and UTC→TDB live in Rust. */
export function createDe441CivilProbeRequest(timestamp: string, target: De441Body, center: De441Body): De441CivilProbeRequest {
  if (typeof timestamp !== 'string' || timestamp.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
    !bodies.has(target) || !bodies.has(center) || target === center) {
    throw new Error('Invalid civil DE441 probe request');
  }
  return Object.freeze({protocolVersion: DE441_PROBE_PROTOCOL_VERSION, timestamp, target, center});
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

/** Preserve the core's explicit UTC-range/accuracy guard in the response. */
export function decodeDe441CivilProbeResponse(raw: unknown): De441CivilProbeResponse {
  const probe = decodeDe441ProbeResponse(raw);
  const payload = record(raw);
  const conversion = payload && record(payload.conversion);
  if (payload?.conversion === null) {
    if (['ok', 'missing_pack', 'invalid_pack', 'outside_coverage', 'reader_failed'].includes(probe.status)) {
      throw new Error('DE441 civil probe is missing time conversion provenance');
    }
    return Object.freeze({...probe, conversion: null});
  }
  if (!conversion || typeof conversion.jdTdb !== 'number' || !Number.isFinite(conversion.jdTdb) ||
    conversion.model !== 'IERS_LEAP_SECONDS_USNO_TRUNCATED_TDB_TT' ||
    conversion.accuracy !== 'approximate' ||
    conversion.utcCoverage !== '1972-01-01/2027-06-27' ||
    conversion.source !== 'virgostars_ephemeris_core' ||
    probe.status === 'unsupported_utc' || probe.status === 'provider_unavailable' ||
    probe.status === 'invalid_request' || probe.status === 'storage_unavailable') {
    throw new Error('Invalid DE441 civil time conversion provenance');
  }
  return Object.freeze({
    ...probe,
    conversion: Object.freeze({
      jdTdb: conversion.jdTdb,
      model: 'IERS_LEAP_SECONDS_USNO_TRUNCATED_TDB_TT',
      accuracy: 'approximate',
      utcCoverage: '1972-01-01/2027-06-27',
      source: 'virgostars_ephemeris_core',
    }),
  });
}
