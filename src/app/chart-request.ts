/**
 * Transport-only request model. No calculation, persistence, or network operation.
 * ISO civil date/time and explicit UTC offset avoid device-timezone inference.
 * Coordinates use WGS84 decimal degrees.
 */
export type ChartRequestV1 = Readonly<{
  schemaVersion: 1;
  localDate: string; // YYYY-MM-DD
  localTime: string; // HH:mm:ss
  utcOffsetMinutes: number; // minutes east of UTC, including fractional-hour zones
  latitude: number;
  longitude: number;
}>;

export type ChartRequestValidation =
  | Readonly<{ ok: true; value: ChartRequestV1 }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateChartRequestV1(input: unknown): ChartRequestValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['request'] };
  const keys = ['schemaVersion', 'localDate', 'localTime', 'utcOffsetMinutes', 'latitude', 'longitude'];
  if (Object.keys(input).some(key => !keys.includes(key))) errors.push('unknownFields');
  if (input['schemaVersion'] !== 1) errors.push('schemaVersion');

  const date = input['localDate'];
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push('localDate');
  } else {
    const [year, month, day] = date.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) errors.push('localDate');
  }
  const time = input['localTime'];
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) errors.push('localTime');

  const offset = input['utcOffsetMinutes'];
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < -720 || offset > 840) errors.push('utcOffsetMinutes');

  const latitude = input['latitude'];
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.push('latitude');
  const longitude = input['longitude'];
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.push('longitude');

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: input as ChartRequestV1 };
}
