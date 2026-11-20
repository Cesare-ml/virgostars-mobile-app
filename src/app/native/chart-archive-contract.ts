/**
 * Experimental desktop-derived archive contract. It carries chart inputs only;
 * the Android host retains keys and paths outside the WebView.
 */
export type ChartRecordV1 = Readonly<{
  id: string;
  name: string;
  utcIso: string;
  timeZone: string;
  latMicro: number;
  lngMicro: number;
  placeName: string;
}>;

export type SavedChartV1 = ChartRecordV1 & Readonly<{createdAtMs: number; updatedAtMs: number}>;

export type ArchiveOperation =
  | Readonly<{operation: 'list'}>
  | Readonly<{operation: 'save'; chart: ChartRecordV1}>
  | Readonly<{operation: 'delete'; id: string}>;

export type ArchiveFailure =
  | 'not_native' | 'invalid_request' | 'not_found' | 'archive_full'
  | 'archive_unavailable' | 'archive_corrupt' | 'archive_newer' | 'archive_locked' | 'unavailable';

export type ArchiveResult =
  | Readonly<{kind: 'ready'; charts: readonly SavedChartV1[]; legacyPresent: boolean}>
  | Readonly<{kind: ArchiveFailure}>;

type WireRequest = {protocolVersion: 1; operation: string; chart?: ChartRecordV1; id?: string};

export interface ChartArchiveTransport {
  isNative(): boolean;
  invoke(command: 'chart_archive', args: {request: WireRequest}): Promise<unknown>;
}

const PROTOCOL_ERROR = 'Invalid chart archive protocol';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
// Control characters and invisible direction/format marks never belong in a label.
const UNSAFE_TEXT = /[\p{Cc}​-‏‪-‮⁦-⁩﻿]/u;
const MAX_CHARTS = 5000;
const FAILURES: readonly string[] = [
  'invalid_request', 'not_found', 'archive_full', 'archive_unavailable', 'archive_corrupt', 'archive_newer', 'archive_locked',
];

function plainObject(x: unknown): x is Record<string, unknown> {
  try {
    if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
    const prototype = Object.getPrototypeOf(x);
    return prototype === Object.prototype || prototype === null;
  } catch {return false;}
}

/** Read one own data property: never a getter, never an inherited value. */
function field(source: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, name);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(PROTOCOL_ERROR);
  return descriptor.value;
}

function label(x: unknown, maxLength: number): x is string {
  return typeof x === 'string' && [...x].length <= maxLength && x.trim() === x && !UNSAFE_TEXT.test(x);
}

function microDegrees(x: unknown, limit: number): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && Math.abs(x) <= limit;
}

/** Read each field once; input never forwards extra fields, accessors or inherited data. */
function snapshotChart(raw: unknown): ChartRecordV1 | null {
  try {
    if (!plainObject(raw)) return null;
    const id = field(raw, 'id'), name = field(raw, 'name'), utcIso = field(raw, 'utcIso');
    const timeZone = field(raw, 'timeZone'), latMicro = field(raw, 'latMicro');
    const lngMicro = field(raw, 'lngMicro'), placeName = field(raw, 'placeName');
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || !label(name, 80) || !label(placeName, 160) ||
      typeof utcIso !== 'string' || !UTC_PATTERN.test(utcIso) ||
      typeof timeZone !== 'string' || timeZone.length > 120 || !ZONE_PATTERN.test(timeZone) ||
      !microDegrees(latMicro, 90_000_000) || !microDegrees(lngMicro, 180_000_000)) return null;
    const year = Number(utcIso.slice(0, 4));
    const expected = utcIso.length === 20 ? utcIso.slice(0, -1) + '.000Z' : utcIso;
    const date = new Date(utcIso);
    if (year < 1600 || year > 2400 || !Number.isFinite(date.getTime()) || date.toISOString() !== expected) return null;
    return {id, name, utcIso, timeZone, latMicro, lngMicro, placeName};
  } catch {return null;}
}

/** Includes the native calendar range and refuses malformed UTC dates. */
export function validChartRecord(chart: ChartRecordV1): boolean {
  return snapshotChart(chart) !== null;
}

function decodeSavedChart(raw: unknown, seen: Set<string>): SavedChartV1 {
  if (!plainObject(raw)) throw new Error(PROTOCOL_ERROR);
  const chart: ChartRecordV1 = {
    id: field(raw, 'id') as string,
    name: field(raw, 'name') as string,
    utcIso: field(raw, 'utcIso') as string,
    timeZone: field(raw, 'timeZone') as string,
    latMicro: field(raw, 'latMicro') as number,
    lngMicro: field(raw, 'lngMicro') as number,
    placeName: field(raw, 'placeName') as string,
  };
  const createdAtMs = field(raw, 'createdAtMs');
  const updatedAtMs = field(raw, 'updatedAtMs');
  if (!validChartRecord(chart) || seen.has(chart.id) ||
      typeof createdAtMs !== 'number' || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0 ||
      typeof updatedAtMs !== 'number' || !Number.isSafeInteger(updatedAtMs) || updatedAtMs < createdAtMs) {
    throw new Error(PROTOCOL_ERROR);
  }
  seen.add(chart.id);
  return Object.freeze({...chart, createdAtMs, updatedAtMs});
}

type DecodedArchive =
  | Readonly<{status: 'ok'; charts: readonly SavedChartV1[]; legacyPresent: boolean}>
  | Readonly<{status: Exclude<ArchiveFailure, 'not_native' | 'unavailable'>}>;

/** Detached, frozen values from one native response; throws a generic error otherwise. */
export function decodeArchiveResponse(raw: unknown): DecodedArchive {
  try {
    if (!plainObject(raw) || field(raw, 'protocolVersion') !== 1) throw new Error(PROTOCOL_ERROR);
    const status = field(raw, 'status');
    if (typeof status === 'string' && FAILURES.includes(status)) {
      return Object.freeze({status: status as Exclude<ArchiveFailure, 'not_native' | 'unavailable'>});
    }
    const charts = field(raw, 'charts');
    if (status !== 'ok' || !Array.isArray(charts) || Object.getPrototypeOf(charts) !== Array.prototype ||
        charts.length > MAX_CHARTS || Reflect.ownKeys(charts).length !== charts.length + 1) {
      throw new Error(PROTOCOL_ERROR);
    }
    const legacyPresent = field(raw, 'legacyPresent');
    if (typeof legacyPresent !== 'boolean') throw new Error(PROTOCOL_ERROR);
    const seen = new Set<string>();
    const decoded = Array.from({length: charts.length}, (_, index) => decodeSavedChart(field(charts, String(index)), seen));
    return Object.freeze({status: 'ok', charts: Object.freeze(decoded), legacyPresent});
  } catch {
    // Never surface native details, accessor or Proxy trap messages.
    throw new Error(PROTOCOL_ERROR);
  }
}

function wireRequest(operation: ArchiveOperation): WireRequest | null {
  try {
    if (!plainObject(operation)) return null;
    const action = field(operation, 'operation');
    if (action === 'list') return {protocolVersion: 1, operation: 'list'};
    if (action === 'save') {
      const chart = snapshotChart(field(operation, 'chart'));
      return chart ? {protocolVersion: 1, operation: 'save', chart} : null;
    }
    if (action === 'delete') {
      const id = field(operation, 'id');
      return typeof id === 'string' && ID_PATTERN.test(id) ? {protocolVersion: 1, operation: 'delete', id} : null;
    }
    return null;
  } catch {return null;}
}

/** One native call per operation; every failure is reduced to a small set of states. */
export async function requestArchive(
  transport: ChartArchiveTransport,
  operation: ArchiveOperation,
): Promise<ArchiveResult> {
  const request = wireRequest(operation);
  if (!request) return {kind: 'invalid_request'};
  try {
    if (!transport.isNative()) return {kind: 'not_native'};
    const decoded = decodeArchiveResponse(await transport.invoke('chart_archive', {request}));
    return decoded.status === 'ok'
      ? {kind: 'ready', charts: decoded.charts, legacyPresent: decoded.legacyPresent}
      : {kind: decoded.status};
  } catch {
    return {kind: 'unavailable'};
  }
}

/** Stable identity for a chart, created once when it is first saved. */
export function newChartId(randomUuid: () => string = () => globalThis.crypto.randomUUID()): string {
  const id = String(randomUuid()).toLowerCase();
  if (!ID_PATTERN.test(id)) throw new Error('Invalid chart id source');
  return id;
}
