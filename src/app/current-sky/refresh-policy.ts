/**
 * Pure policy shared by the live-sky service and unit tests.
 * No astronomy is implemented here.
 */
export const CURRENT_SKY_REFRESH_INTERVAL_MS = 60_000;
export const CURRENT_SKY_LOCATION_CHANGE_METERS = 250;
export const CURRENT_SKY_MAX_FIX_AGE_MS = 45_000;
export const CURRENT_SKY_MAX_FUTURE_FIX_SKEW_MS = 5_000;

const EARTH_MEAN_RADIUS_METERS = 6_371_008.8;

export interface CurrentSkyLocationFix {
  latitudeDeg: number;
  longitudeDegEast: number;
  accuracyMeters: number;
  measuredAtMs: number;
}

export interface CurrentSkyRefreshBaseline {
  lastRequestAtMs: number;
  latitudeDeg: number;
  longitudeDegEast: number;
}

export function isValidCurrentSkyFix(
  fix: CurrentSkyLocationFix,
  nowMs: number,
  maxAgeMs = CURRENT_SKY_MAX_FIX_AGE_MS
): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false;
  if (
    !Number.isFinite(fix.latitudeDeg) ||
    fix.latitudeDeg < -90 ||
    fix.latitudeDeg > 90 ||
    !Number.isFinite(fix.longitudeDegEast) ||
    fix.longitudeDegEast < -180 ||
    fix.longitudeDegEast > 180 ||
    !Number.isFinite(fix.accuracyMeters) ||
    fix.accuracyMeters < 0 ||
    !Number.isFinite(fix.measuredAtMs)
  ) return false;

  const ageMs = nowMs - fix.measuredAtMs;
  return ageMs <= maxAgeMs && ageMs >= -CURRENT_SKY_MAX_FUTURE_FIX_SKEW_MS;
}

export function shouldRefreshCurrentSky(
  baseline: CurrentSkyRefreshBaseline | null,
  nowMs: number,
  fix: CurrentSkyLocationFix
): boolean {
  if (!isValidCurrentSkyFix(fix, nowMs)) return false;
  if (!baseline) return true;
  if (!Number.isFinite(baseline.lastRequestAtMs)) return true;
  if (!isValidCoordinatePair(baseline.latitudeDeg, baseline.longitudeDegEast)) return true;
  if (nowMs < baseline.lastRequestAtMs) return true;
  if (nowMs - baseline.lastRequestAtMs >= CURRENT_SKY_REFRESH_INTERVAL_MS) return true;

  return distanceMeters(
    baseline.latitudeDeg,
    baseline.longitudeDegEast,
    fix.latitudeDeg,
    fix.longitudeDegEast
  ) >= CURRENT_SKY_LOCATION_CHANGE_METERS;
}

export function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number {
  if (
    !isValidCoordinatePair(latitudeA, longitudeA) ||
    !isValidCoordinatePair(latitudeB, longitudeB)
  ) return Number.POSITIVE_INFINITY;

  const toRadians = (degrees: number): number => degrees * Math.PI / 180;
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(longitudeB - longitudeA);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, a)));
}

function isValidCoordinatePair(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}
