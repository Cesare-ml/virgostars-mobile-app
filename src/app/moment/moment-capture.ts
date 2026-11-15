/**
 * Captured moments are ephemeral previews until an encrypted, profile-scoped
 * archive exists. They are NOT calculated charts or persisted birth records.
 */
export type CaptureSource = 'in-app' | 'android-quick-settings' | 'ios-shortcut';

export interface LocationSample {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  measuredAtMs: number;
}

export interface MomentCaptureRecord {
  id: string;
  capturedAtUtc: string;
  timezoneId: string;
  utcOffsetMinutes: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  positionMeasuredAtUtc: string;
  source: CaptureSource;
  calculationStatus: 'not-calculated';
  persistence: 'session-only';
}

/**
 * The trigger timestamp is taken *before* GPS acquisition, so waiting for a
 * location fix never moves the astronomical moment forward in time.
 */
export async function captureMoment(
  provider: () => Promise<LocationSample>,
  source: CaptureSource = 'in-app',
  now: () => Date = () => new Date(),
  makeId: () => string = () => crypto.randomUUID()
): Promise<MomentCaptureRecord> {
  const timestamp = now();
  const captureMs = timestamp.getTime();
  if (!Number.isFinite(captureMs)) throw new Error('invalid-device-clock');
  const timezoneId = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const offset = -timestamp.getTimezoneOffset();
  const location = await provider();

  if (
    !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 ||
    !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180 ||
    !Number.isFinite(location.accuracyMeters) || location.accuracyMeters < 0 ||
    !Number.isFinite(location.measuredAtMs) ||
    Math.abs(location.measuredAtMs - captureMs) > 45_000
  ) {
    throw new Error('unreliable-position');
  }

  return {
    id: makeId(),
    capturedAtUtc: timestamp.toISOString(),
    timezoneId,
    utcOffsetMinutes: offset,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters,
    positionMeasuredAtUtc: new Date(location.measuredAtMs).toISOString(),
    source,
    calculationStatus: 'not-calculated',
    persistence: 'session-only'
  };
}
