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

export interface SkyBody {
  id: string;
  longitude: number;
}

export interface SkyChart {
  zodiac: 'tropical';
  bodies: SkyBody[];
}

/** Do not render arbitrary native JSON as astronomical positions. */
export function parseSkyChart(value: unknown): SkyChart | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record['zodiac'] !== 'tropical' || !Array.isArray(record['bodies'])) return null;
  const allowed = new Set(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
  const bodies: SkyBody[] = [];
  const seen = new Set<string>();
  for (const entry of record['bodies']) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const body = entry as Record<string, unknown>;
    if (typeof body['id'] !== 'string' || !allowed.has(body['id']) || seen.has(body['id'])) return null;
    if (typeof body['longitude'] !== 'number' || !Number.isFinite(body['longitude']) ||
        body['longitude'] < 0 || body['longitude'] >= 360) return null;
    seen.add(body['id']);
    bodies.push({ id: body['id'], longitude: body['longitude'] });
  }
  // An incomplete planetary set must not masquerade as a natal chart.
  if (bodies.length !== allowed.size) return null;
  return { zodiac: 'tropical', bodies };
}

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
  | 'ready'
  | 'browser-preview'
  | 'permission-denied'
  | 'location-unavailable'
  | 'engine-unavailable'
  | 'renderer-unavailable'
  | 'failed';
