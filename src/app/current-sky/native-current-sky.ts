import { isTauri, invoke } from '@tauri-apps/api/core';
import {
  checkPermissions,
  getCurrentPosition,
  requestPermissions
} from '@tauri-apps/plugin-geolocation';
import type {
  CurrentSkyRequest,
  CurrentSkyResponse,
  DeviceLocationFix
} from './current-sky.models';

export class CurrentSkyLocationError extends Error {
  constructor(readonly code: 'native-runtime-required' | 'permission-denied' | 'location-unavailable') {
    super(code);
    this.name = 'CurrentSkyLocationError';
  }
}

/** Requests foreground location only. No background permission or location history. */
export async function getCurrentSkyLocation(): Promise<DeviceLocationFix> {
  if (!isTauri()) throw new CurrentSkyLocationError('native-runtime-required');

  try {
    let permission = await checkPermissions();
    if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
      permission = await requestPermissions(['location']);
    }
    if (permission.location !== 'granted') {
      throw new CurrentSkyLocationError('permission-denied');
    }

    const position = await getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000
    });
    const { latitude, longitude, accuracy } = position.coords;

    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(accuracy) || accuracy < 0 ||
      !Number.isFinite(position.timestamp)
    ) {
      throw new CurrentSkyLocationError('location-unavailable');
    }

    return {
      latitude,
      longitude,
      accuracyMeters: accuracy,
      measuredAtMs: position.timestamp
    };
  } catch (error: unknown) {
    if (error instanceof CurrentSkyLocationError) throw error;
    throw new CurrentSkyLocationError('location-unavailable');
  }
}

/** The UI sends inputs only; all astronomy must happen in the native provider. */
export function calculateCurrentSky(request: CurrentSkyRequest): Promise<CurrentSkyResponse> {
  return invoke<CurrentSkyResponse>('calculate_current_sky', { request });
}
