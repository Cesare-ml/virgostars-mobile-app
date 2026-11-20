import moment from 'moment-timezone';

export type CivilTimeResult =
  | {kind: 'ready'; utcIso: string}
  | {kind: 'invalid' | 'unknown_zone' | 'nonexistent' | 'ambiguous'};

const CIVIL_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const FULL_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSS';

function civilWall(civil: string): moment.Moment | null {
  const parts = CIVIL_PATTERN.exec(civil);
  if (!parts) return null;
  const normalized = `${parts[1]}:${parts[2] ?? '00'}.${(parts[3] ?? '').padEnd(3, '0')}`;
  const wall = moment.utc(normalized, FULL_FORMAT, true);
  return wall.isValid() ? wall : null;
}

/** Format only the necessary precision while retaining the exact local millisecond. */
function formatCivil(value: moment.Moment): string {
  return value.format(value.millisecond() ? FULL_FORMAT : value.second() ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DDTHH:mm');
}

/** Convert local civil time in an explicit IANA zone without guessing at gaps or overlaps. */
export function civilTimeToUtc(civil: string, zoneName: string, occurrence: '' | 'earlier' | 'later' = ''): CivilTimeResult {
  const wall = civilWall(civil);
  if (!wall) return {kind:'invalid'};
  const zone = moment.tz.zone(zoneName);
  if (!zone) return {kind:'unknown_zone'};
  const normalized = wall.format(FULL_FORMAT);
  const matches = [...new Set(zone.offsets)]
    .map(offset => Math.round(wall.valueOf() + offset * 60000))
    .filter(epoch => moment.tz(epoch, zoneName).format(FULL_FORMAT) === normalized)
    .sort((a,b) => a-b);
  const unique = [...new Set(matches)];
  if (!unique.length) return {kind:'nonexistent'};
  if (unique.length > 1 && !occurrence) return {kind:'ambiguous'};
  const chosen = occurrence === 'later' ? unique[unique.length - 1] : unique[0];
  return {kind:'ready', utcIso: new Date(chosen).toISOString()};
}
export type SkyStep = 'minute' | 'hour' | 'day' | 'month' | 'year';
export type CivilTime = {civil: string; occurrence: '' | 'earlier' | 'later'};
export type SkyStepTarget =
  | {kind: 'ready'; value: CivilTime}
  | {kind: 'ambiguous' | 'nonexistent'; civil: string}
  | {kind: 'invalid'};

/** Represent an instant in the selected zone without losing which repeated minute it is. */
export function instantToCivil(epoch: number, zone: string): CivilTime | null {
  if (!Number.isFinite(epoch) || !moment.tz.zone(zone)) return null;
  const value = moment.tz(epoch, zone);
  if (!value.isValid()) return null;
  const civil = value.format('YYYY-MM-DDTHH:mm');
  const earlier = civilTimeToUtc(civil, zone, 'earlier');
  const later = civilTimeToUtc(civil, zone, 'later');
  if (earlier.kind !== 'ready' || later.kind !== 'ready') return null;
  const occurrence = earlier.utcIso === later.utcIso ? '' :
    (Math.floor(epoch / 60000) === Math.floor(Date.parse(later.utcIso) / 60000) ? 'later' : 'earlier');
  return {civil, occurrence};
}

/** Preserve seconds and milliseconds, including the exact occurrence in an overlap. */
export function instantToCivilExact(epoch: number, zone: string): CivilTime | null {
  if (!Number.isSafeInteger(epoch) || !moment.tz.zone(zone)) return null;
  const value = moment.tz(epoch, zone);
  if (!value.isValid()) return null;
  const civil = formatCivil(value);
  const earlier = civilTimeToUtc(civil, zone, 'earlier');
  const later = civilTimeToUtc(civil, zone, 'later');
  if (earlier.kind !== 'ready' || later.kind !== 'ready') return null;
  const first = Date.parse(earlier.utcIso), last = Date.parse(later.utcIso);
  if (epoch !== first && epoch !== last) return null;
  return {civil, occurrence:first === last ? '' : epoch === last ? 'later' : 'earlier'};
}

/** Minutes and hours are elapsed time; days follow the local calendar without guessing DST. */
export function skyStepTarget(utcIso: string, zone: string, unit: SkyStep, amount: number): SkyStepTarget {
  const epoch = Date.parse(utcIso);
  if (!Number.isFinite(epoch) || !moment.tz.zone(zone) || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 30) return {kind:'invalid'};
  if (unit === 'minute' || unit === 'hour') {
    const value = instantToCivilExact(epoch + amount * (unit === 'minute' ? 60000 : 3600000), zone);
    return value ? {kind:'ready', value} : {kind:'invalid'};
  }
  if (unit !== 'day' && unit !== 'month' && unit !== 'year') return {kind:'invalid'};
  const local = instantToCivilExact(epoch, zone);
  if (!local) return {kind:'invalid'};
  const wall = civilWall(local.civil);
  if (!wall) return {kind:'invalid'};
  const civil = formatCivil(wall.add(amount, unit === 'day' ? 'days' : unit === 'month' ? 'months' : 'years'));
  const result = civilTimeToUtc(civil, zone);
  if (result.kind === 'ready') return {kind:'ready', value:{civil, occurrence:''}};
  if (result.kind === 'ambiguous' || result.kind === 'nonexistent') return {kind:result.kind, civil};
  return {kind:'invalid'};
}

/** Compatibility helper for callers that only accept an unambiguous result. */
export function stepSky(utcIso: string, zone: string, unit: SkyStep, amount: number): CivilTime | null {
  const target = skyStepTarget(utcIso, zone, unit, amount);
  return target.kind === 'ready' ? target.value : null;
}

export type RelocationMode = 'instant' | 'wall';
export type RelocationResult =
  | {kind:'ready'; utcIso:string; local:CivilTime; latitude:string; longitude:string; zone:string}
  | {kind:'invalid_coordinates' | 'unknown_zone' | 'invalid_time' | 'ambiguous' | 'nonexistent'};

/** A relocation either retains the instant or explicitly reinterprets the wall time. */
export function planRelocation(utcIso:string, sourceZone:string, latitude:string, longitude:string, targetZone:string,
  mode:RelocationMode, occurrence:'' | 'earlier' | 'later'): RelocationResult {
  const lat = Number(latitude), lng = Number(longitude), zone = targetZone.trim();
  if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return {kind:'invalid_coordinates'};
  if ((mode !== 'instant' && mode !== 'wall') || (occurrence !== '' && occurrence !== 'earlier' && occurrence !== 'later')) return {kind:'invalid_time'};
  const epoch = Date.parse(utcIso);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== utcIso) return {kind:'invalid_time'};
  const source = instantToCivilExact(epoch, sourceZone);
  if (!source) return {kind:'invalid_time'};
  const targetAtInstant = instantToCivilExact(epoch, zone);
  if (!targetAtInstant) return {kind:'unknown_zone'};
  if (mode === 'instant') return {kind:'ready', utcIso, local:targetAtInstant, latitude, longitude, zone};
  const resolved = civilTimeToUtc(source.civil, zone, occurrence);
  if (resolved.kind !== 'ready') return {kind:resolved.kind === 'unknown_zone' ? 'unknown_zone' : resolved.kind === 'ambiguous' || resolved.kind === 'nonexistent' ? resolved.kind : 'invalid_time'};
  const local = instantToCivilExact(Date.parse(resolved.utcIso), zone);
  if (!local) return {kind:'invalid_time'};
  return {kind:'ready', utcIso:resolved.utcIso, local, latitude, longitude, zone};
}
