import { isTauri } from '@tauri-apps/api/core';
import {
  checkPermissions,
  getCurrentPosition,
  requestPermissions
} from '@tauri-apps/plugin-geolocation';

export interface LocationSample {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  measuredAtMs: number;
}

/**
 * Requests foreground location only. There is intentionally no watchPosition,
 * background permission, network lookup or persistence.
 */
export async function getCurrentLocation(): Promise<LocationSample> {
  if (!isTauri()) throw new Error('native-only');

  let permission = await checkPermissions();
  if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
    permission = await requestPermissions(['location']);
  }
  if (permission.location !== 'granted') {
    throw new Error('location-permission-denied');
  }

  const position = await getCurrentPosition({
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15_000
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    measuredAtMs: position.timestamp
  };
}
