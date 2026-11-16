import { Injectable, signal } from '@angular/core';
import { isTauri, invoke } from '@tauri-apps/api/core';
import {
  checkPermissions,
  getCurrentPosition,
  requestPermissions
} from '@tauri-apps/plugin-geolocation';
import {
  CURRENT_SKY_CONTRACT_VERSION,
  type CurrentSkyInput,
  type CurrentSkySnapshot,
  type CurrentSkyUiState
} from './contracts';
import {
  CURRENT_SKY_MAX_FIX_AGE_MS,
  isValidCurrentSkyFix,
  shouldRefreshCurrentSky,
  type CurrentSkyLocationFix,
  type CurrentSkyRefreshBaseline
} from './refresh-policy';

@Injectable({ providedIn: 'root' })
export class CurrentSkyService {
  readonly state = signal<CurrentSkyUiState>({
    status: 'starting',
    requestedAtUtc: null,
    snapshot: null,
    message: null
  });

  private timer: number | null = null;
  private inFlight = false;
  private started = false;
  private baseline: CurrentSkyRefreshBaseline | null = null;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') void this.refreshNow(true);
  };

  /** Begin one-shot location + calculation, then refresh only in foreground. */
  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (document.visibilityState === 'visible') void this.refreshNow(true);
    this.timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.refreshNow(false);
    }, 15_000);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** User-triggered retry after permission denial, GPS failure or engine setup. */
  async retry(): Promise<void> {
    await this.refreshNow(true);
  }

  private async refreshNow(force: boolean): Promise<void> {
    if (this.inFlight || document.visibilityState !== 'visible') return;
    this.inFlight = true;

    const capturedAt = new Date();
    const capturedAtMs = capturedAt.getTime();
    this.state.set({
      status: 'starting',
      requestedAtUtc: capturedAt.toISOString(),
      snapshot: null,
      message: null
    });

    try {
      if (!isTauri()) {
        this.state.set({
          status: 'engine-unavailable',
          requestedAtUtc: capturedAt.toISOString(),
          snapshot: null,
          message: 'native-runtime-required'
        });
        return;
      }

      const permission = await this.ensureLocationPermission();
      if (!permission) {
        this.state.set({
          status: 'permission-required',
          requestedAtUtc: capturedAt.toISOString(),
          snapshot: null,
          message: 'location-permission-denied'
        });
        return;
      }

      const position = await getCurrentPosition({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000
      });
      const fix: CurrentSkyLocationFix = {
        latitudeDeg: position.coords.latitude,
        longitudeDegEast: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        measuredAtMs: position.timestamp
      };

      if (!isValidCurrentSkyFix(fix, Date.now(), CURRENT_SKY_MAX_FIX_AGE_MS)) {
        this.state.set({
          status: 'location-unavailable',
          requestedAtUtc: capturedAt.toISOString(),
          snapshot: null,
          message: 'location-fix-invalid-or-stale'
        });
        return;
      }

      if (!force && !shouldRefreshCurrentSky(this.baseline, Date.now(), fix)) return;

      this.state.set({
        status: 'calculating',
        requestedAtUtc: capturedAt.toISOString(),
        snapshot: null,
        message: null
      });

      const input: CurrentSkyInput = {
        schemaVersion: CURRENT_SKY_CONTRACT_VERSION,
        capturedAtUtc: capturedAt.toISOString(),
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        utcOffsetMinutes: -capturedAt.getTimezoneOffset(),
        latitudeDeg: fix.latitudeDeg,
        longitudeDegEast: fix.longitudeDegEast,
        altitudeMeters: position.coords.altitude,
        locationAccuracyMeters: fix.accuracyMeters
      };

      const snapshot = await invoke<CurrentSkySnapshot>('calculate_current_sky', { input });
      if (!this.isValidSnapshot(snapshot, input)) {
        this.state.set({
          status: 'failed',
          requestedAtUtc: capturedAt.toISOString(),
          snapshot: null,
          message: 'engine-returned-invalid-snapshot'
        });
        return;
      }

      this.baseline = {
        calculatedAtMs: Date.parse(snapshot.calculatedAtUtc),
        latitudeDeg: fix.latitudeDeg,
        longitudeDegEast: fix.longitudeDegEast
      };
      this.state.set({
        status: 'ready',
        requestedAtUtc: capturedAt.toISOString(),
        snapshot,
        message: null
      });
    } catch (error: unknown) {
      const code = this.errorCode(error);
      const permissionDenied = code.includes('permission');
      const engineMissing = code.includes('sky_engine_unavailable')
        || code.includes('native-runtime-required');
      this.state.set({
        status: permissionDenied
          ? 'permission-required'
          : engineMissing ? 'engine-unavailable' : 'location-unavailable',
        requestedAtUtc: capturedAt.toISOString(),
        snapshot: null,
        message: code
      });
    } finally {
      this.inFlight = false;
    }
  }

  private async ensureLocationPermission(): Promise<boolean> {
    let permission = await checkPermissions();
    if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
      permission = await requestPermissions(['location']);
    }
    return permission.location === 'granted';
  }

  private isValidSnapshot(snapshot: CurrentSkySnapshot, input: CurrentSkyInput): boolean {
    if (
      snapshot.schemaVersion !== CURRENT_SKY_CONTRACT_VERSION ||
      snapshot.timezoneId !== input.timezoneId ||
      snapshot.utcOffsetMinutes !== input.utcOffsetMinutes ||
      Math.abs(snapshot.observer.latitudeDeg - input.latitudeDeg) > 1e-7 ||
      Math.abs(snapshot.observer.longitudeDegEast - input.longitudeDegEast) > 1e-7 ||
      !Number.isFinite(Date.parse(snapshot.calculatedAtUtc)) ||
      !snapshot.provider?.id ||
      !snapshot.provider?.version ||
      !Array.isArray(snapshot.positions) ||
      snapshot.positions.length === 0 ||
      !Array.isArray(snapshot.houseCusps) ||
      snapshot.houseCusps.length !== 12 ||
      !Array.isArray(snapshot.aspects)
    ) return false;

    const expectedBodies = new Set([
      'sun', 'moon', 'mercury', 'venus', 'mars',
      'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'
    ]);
    return snapshot.positions.every((position) =>
      expectedBodies.has(position.body) &&
      Number.isFinite(position.longitudeDeg) &&
      position.longitudeDeg >= 0 && position.longitudeDeg < 360 &&
      Number.isFinite(position.latitudeDeg)
    );
  }

  private errorCode(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return 'current-sky-unexpected-error';
  }
}
