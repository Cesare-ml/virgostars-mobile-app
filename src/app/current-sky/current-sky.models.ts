export interface DeviceLocationFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  measuredAtMs: number;
}

export interface CurrentSkyRequest {
  /** ISO-8601 UTC instant captured immediately after the location fix. */
  instantUtc: string;
  timezoneId: string;
  latitude: number;
  longitude: number;
  locationAccuracyMeters: number;
}

export interface EngineProvenance {
  provider: string;
  version: string;
  timeScale: string;
  coordinateFrame: string;
  center: string;
  positionMode: string;
}

export type CurrentSkyStatus = 'ready' | 'unavailable' | 'failed';

export interface CurrentSkyResponse {
  schemaVersion: 1;
  status: CurrentSkyStatus;
  calculatedAtUtc: string | null;
  engine: EngineProvenance | null;
  /** Payload is owned by the canonical astrological-functions contract. */
  chart: unknown | null;
  errorCode: string | null;
  message: string | null;
}

export type CurrentSkyScreenState =
  | 'loading'
  | 'ready'
  | 'permission-denied'
  | 'location-unavailable'
  | 'engine-unavailable'
  | 'failed';
