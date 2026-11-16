export interface DeviceLocationFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  measuredAtMs: number;
}

export interface CurrentSkyRequest {
  /** UTC instant corresponding to the observed device location fix. */
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
  /** Payload belongs to the canonical astrological-functions chart contract. */
  chart: unknown | null;
  errorCode: string | null;
  message: string | null;
}

export type CurrentSkyScreenState =
  | 'loading'
  | 'browser-preview'
  | 'permission-denied'
  | 'location-unavailable'
  | 'engine-unavailable'
  | 'renderer-unavailable'
  | 'failed';
