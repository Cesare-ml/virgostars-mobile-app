import { validateChartRequestV1, type ChartRequestV1 } from './chart-request';

/**
 * Deterministic conversion from an explicitly offset civil time to UTC.
 * Never guesses a timezone from device settings or geographic coordinates.
 * The caller must resolve DST ambiguity before constructing the request.
 */
export type UtcInstantV1 = Readonly<{
  schemaVersion: 1;
  isoUtc: string;
  unixMilliseconds: number;
}>;

export type InstantResult =
  | Readonly<{ ok: true; value: UtcInstantV1 }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

export function toUtcInstantV1(input: unknown): InstantResult {
  const parsed = validateChartRequestV1(input);
  if (!parsed.ok) return parsed;
  const request: ChartRequestV1 = parsed.value;
  const [year, month, day] = request.localDate.split('-').map(Number);
  const [hour, minute, second] = request.localTime.split(':').map(Number);

  // setUTCFullYear handles 0001–0099 without Date.UTC's 1900 offset.
  const civil = new Date(0);
  civil.setUTCFullYear(year, month - 1, day);
  civil.setUTCHours(hour, minute, second, 0);
  const unixMilliseconds = civil.getTime() - request.utcOffsetMinutes * 60_000;
  const utc = new Date(unixMilliseconds);
  // JS Date supports year zero, but the public v1 contract uses 0001–9999.
  if (!Number.isFinite(unixMilliseconds) || utc.getUTCFullYear() < 1 || utc.getUTCFullYear() > 9999) {
    return { ok: false, errors: ['utcRange'] };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      isoUtc: utc.toISOString(),
      unixMilliseconds
    }
  };
}
