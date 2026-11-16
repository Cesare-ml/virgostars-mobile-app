import { validateChartRequestV1, type ChartRequestV1 } from './chart-request';

/**
 * Convert an explicitly offset civil timestamp to UTC without consulting the
 * device timezone. Reject unsupported JavaScript Date instants.
 * This is time normalization only; it is not an astronomical calculation.
 */
export function chartRequestUtcIso(input: unknown): string | null {
  const result = validateChartRequestV1(input);
  if (!result.ok) return null;
  const request: ChartRequestV1 = result.value;
  const [year, month, day] = request.localDate.split('-').map(Number);
  const [hour, minute, second] = request.localTime.split(':').map(Number);
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);
  const utcMillis = instant.getTime() - request.utcOffsetMinutes * 60_000;
  if (!Number.isFinite(utcMillis)) return null;
  const utc = new Date(utcMillis);
  return Number.isNaN(utc.getTime()) ? null : utc.toISOString();
}
