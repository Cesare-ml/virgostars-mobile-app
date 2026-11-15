import { isTauri } from '@tauri-apps/api/core';
import { checkPermissions, requestPermissions, getCurrentPosition } from '@tauri-apps/plugin-geolocation';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import type { LocationSample } from './moment-capture';

/**
 * Foreground, one-shot GPS request after a voluntary click.
 * Never watches location or requests background location permission.
 */
export async function getMomentPosition(): Promise<LocationSample> {
  if (!isTauri()) throw new Error('native-only');
  let permission = await checkPermissions();
  if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
    permission = await requestPermissions(['location']);
  }
  if (permission.location !== 'granted') throw new Error('location-permission-denied');
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

/** Notification messages never contain sensitive coordinates or the captured time. */
export async function notifyMomentCaptured(): Promise<boolean> {
  if (!isTauri()) return false;
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === 'granted';
  if (!granted) return false;
  sendNotification({
    title: 'VirgoStars',
    body: 'Momento acquisito in anteprima. Apri l’app per visualizzarlo.'
  });
  return true;
}
