/** Versioned UI/native boundary for the live sky MVP. */
export const CURRENT_SKY_CONTRACT_VERSION = 1 as const;

export type SkyBody =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

export interface CurrentSkyInput {
  schemaVersion: typeof CURRENT_SKY_CONTRACT_VERSION;
  capturedAtUtc: string;
  timezoneId: string;
  utcOffsetMinutes: number;
  latitudeDeg: number;
  longitudeDegEast: number;
  altitudeMeters: number | null;
  locationAccuracyMeters: number;
}

export interface CurrentSkyPosition {
  body: SkyBody;
  longitudeDeg: number;
  latitudeDeg: number;
  /** null when the provider cannot supply validated angular velocity. */
  retrograde: boolean | null;
}

export interface CurrentSkyAngle {
  longitudeDeg: number;
  latitudeDeg: number;
}

export interface CurrentSkyAspect {
  firstBody: SkyBody | 'ascendant' | 'midheaven';
  secondBody: SkyBody | 'ascendant' | 'midheaven';
  aspect: string;
  exactAngleDeg: number;
  orbDeg: number;
  applying: boolean | null;
}

export interface CurrentSkySnapshot {
  schemaVersion: typeof CURRENT_SKY_CONTRACT_VERSION;
  calculatedAtUtc: string;
  timezoneId: string;
  utcOffsetMinutes: number;
  observer: {
    latitudeDeg: number;
    longitudeDegEast: number;
    altitudeMeters: number | null;
    locationAccuracyMeters: number;
  };
  provider: {
    id: string;
    version: string;
    ephemeris: string;
    timeScale: string;
    coordinateFrame: string;
    zodiac: 'tropical' | 'sidereal';
    ayanamsaId: string | null;
    houseSystem: string;
    limitations: string[];
  };
  positions: CurrentSkyPosition[];
  ascendant: CurrentSkyAngle;
  midheaven: CurrentSkyAngle;
  houseCusps: number[];
  aspects: CurrentSkyAspect[];
}

export type CurrentSkyUiStatus =
  | 'starting'
  | 'permission-required'
  | 'location-unavailable'
  | 'calculating'
  | 'engine-unavailable'
  | 'ready'
  | 'failed';

export interface CurrentSkyUiState {
  status: CurrentSkyUiStatus;
  requestedAtUtc: string | null;
  snapshot: CurrentSkySnapshot | null;
  message: string | null;
}
