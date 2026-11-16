import type { LocationSample } from '../moment/moment-capture';

export interface LiveSkySnapshot {
  observedAtUtc: string;
  timezoneId: string;
  utcOffsetMinutes: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  positionMeasuredAtUtc: string;
}

export type LiveSkyFailure = 'invalid-device-clock' | 'unreliable-position';

/**
 * Creates a fresh observation after the foreground GPS request completes.
 * The device clock is the chart epoch; the GPS fix time is retained separately.
 * No location is persisted or transmitted.
 */
export async function readLiveSkySnapshot(
  readPosition: () => Promise<LocationSample>,
  now: () => Date = () => new Date()
): Promise<LiveSkySnapshot> {
  const location = await readPosition();
  const observedAt = now();
  const observedAtMs = observedAt.getTime();

  if (!Number.isFinite(observedAtMs)) throw new Error('invalid-device-clock');

  const validCoordinates =
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 && location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 && location.longitude <= 180;
  const validAccuracy =
    Number.isFinite(location.accuracyMeters) && location.accuracyMeters >= 0;
  const validMeasurementTime =
    Number.isFinite(location.measuredAtMs) &&
    Math.abs(location.measuredAtMs - observedAtMs) <= 45_000;

  if (!validCoordinates || !validAccuracy || !validMeasurementTime) {
    throw new Error('unreliable-position');
  }

  const timezoneId = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return {
    observedAtUtc: observedAt.toISOString(),
    timezoneId,
    utcOffsetMinutes: -observedAt.getTimezoneOffset(),
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters,
    positionMeasuredAtUtc: new Date(location.measuredAtMs).toISOString()
  };
}
