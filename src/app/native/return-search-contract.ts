/**
 * Experimental transport contract derived from VirgoStars Desktop 023d76d
 * (CPAL-1.0). No transport is registered and this module performs no astronomy.
 * A return search uses one longitude, one body and one UTC calendar year.
 */
import type {ChartProviderV1} from './chart-calculation-contract';

export type ReturnBody = 'Sun' | 'Moon';
export type ReturnRequestV1 = Readonly<{body: ReturnBody; targetLongitudeDeg: number; year: number}>;
export type ReturnInstantV1 = Readonly<{utcIso: string; julianDayUt: number}>;
export type ReturnSearchResult =
  | Readonly<{kind:'ready'; provider:ChartProviderV1; instants:readonly ReturnInstantV1[]}>
  | Readonly<{kind:'not_native' | 'provider_unavailable' | 'invalid_request' | 'calculation_failed' | 'unavailable'}>;
export interface ReturnSearchTransport {
  isNative(): boolean;
  invoke(command:'find_returns', args:{request:ReturnRequestV1 & {protocolVersion:1}}): Promise<unknown>;
}

const ERROR = 'Invalid return search protocol';
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EPOCH_JD = 2_440_587.5;
const DAY_MS = 86_400_000;
export const MIN_RETURN_YEAR = 1600;
export const MAX_RETURN_YEAR = 2400;

function plainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function field(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(ERROR);
  return descriptor.value;
}
/** Snapshot before any asynchronous work; reject accessors and hostile proxies. */
function snapshotRequest(value: unknown): ReturnRequestV1 | null {
  try {
    if (!plainObject(value)) return null;
    const body = field(value, 'body'), longitude = field(value, 'targetLongitudeDeg'), year = field(value, 'year');
    if ((body !== 'Sun' && body !== 'Moon') || typeof longitude !== 'number' || !Number.isFinite(longitude) ||
        longitude < 0 || longitude >= 360 || typeof year !== 'number' || !Number.isSafeInteger(year) ||
        year < MIN_RETURN_YEAR || year > MAX_RETURN_YEAR) return null;
    return Object.freeze({body, targetLongitudeDeg:longitude, year});
  } catch { return null; }
}
export function validReturnRequest(value: unknown): boolean { return snapshotRequest(value) !== null; }

type DecodedReturns =
  | Readonly<{status:'ok'; provider:ChartProviderV1; instants:readonly ReturnInstantV1[]}>
  | Readonly<{status:'provider_unavailable' | 'invalid_request' | 'calculation_failed'}>;

/** A successful response must belong to the exact requested half-open UTC year. */
export function decodeReturnResponse(raw: unknown, request: ReturnRequestV1): DecodedReturns {
  try {
    const input = snapshotRequest(request);
    if (!input || !plainObject(raw) || field(raw, 'protocolVersion') !== 1) throw new Error(ERROR);
    const status = field(raw, 'status');
    if (status === 'provider_unavailable' || status === 'invalid_request' || status === 'calculation_failed') return Object.freeze({status});
    const provider = field(raw, 'provider'), entries = field(raw, 'instants');
    if (status !== 'ok' || !plainObject(provider) || !Array.isArray(entries) ||
        Object.getPrototypeOf(entries) !== Array.prototype) throw new Error(ERROR);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(entries, 'length');
    const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, 'value') ? lengthDescriptor.value : null;
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0 ||
        length > (input.body === 'Sun' ? 2 : 16) || Reflect.ownKeys(entries).length !== length + 1) throw new Error(ERROR);
    const id = field(provider, 'id'), engineVersion = field(provider, 'engineVersion');
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(id) ||
        typeof engineVersion !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(engineVersion)) throw new Error(ERROR);
    const start = Date.UTC(input.year, 0, 1), end = Date.UTC(input.year + 1, 0, 1);
    let previousJd = -Infinity, previousMs = -Infinity;
    const instants: ReturnInstantV1[] = [];
    for (let i = 0; i < length; i++) {
      const item = field(entries, String(i));
      if (!plainObject(item)) throw new Error(ERROR);
      const utcIso = field(item, 'utcIso'), jd = field(item, 'julianDayUt');
      if (typeof utcIso !== 'string' || !UTC_PATTERN.test(utcIso) || typeof jd !== 'number' || !Number.isFinite(jd)) throw new Error(ERROR);
      const ms = Date.parse(utcIso), jdMs = (jd - EPOCH_JD) * DAY_MS;
      if (!Number.isFinite(ms) || new Date(ms).toISOString() !== utcIso || ms < start || ms >= end ||
          jdMs < start || jdMs >= end || Math.abs(ms - jdMs) > 1 || jd <= previousJd || ms <= previousMs) throw new Error(ERROR);
      instants.push(Object.freeze({utcIso, julianDayUt:jd}));
      previousJd = jd; previousMs = ms;
    }
    return Object.freeze({status:'ok', provider:Object.freeze({id, engineVersion}), instants:Object.freeze(instants)});
  } catch { throw new Error(ERROR); }
}

/** Injected transport only. Errors never expose native or accessor details. */
export async function requestReturns(transport: ReturnSearchTransport, request: ReturnRequestV1): Promise<ReturnSearchResult> {
  const input = snapshotRequest(request);
  if (!input) return {kind:'invalid_request'};
  try {
    if (!transport.isNative()) return {kind:'not_native'};
    const raw = await transport.invoke('find_returns', {request:{protocolVersion:1, ...input}});
    const decoded = decodeReturnResponse(raw, input);
    return decoded.status === 'ok' ? {kind:'ready', provider:decoded.provider, instants:decoded.instants} : {kind:decoded.status};
  } catch { return {kind:'unavailable'}; }
}
