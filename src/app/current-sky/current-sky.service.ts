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

  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (document.visibilityState === 'visible') void this.refreshNow(true);
    // Poll GPS every 15s to notice travel, but calculate at most once/minute.
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

  /** Explicit retry after permission denial, no fix, or an unavailable engine. */
  async retry(): Promise<void> {
    this.baseline = null;
    await this.refreshNow(true);
  }

  private async refreshNow(force: boolean): Promise<void> {
    if (this.inFlight || document.visibilityState !== 'visible') return;
    this.inFlight = true;
    const startedAtUtc = new Date().toISOString();

    try {
      if (!isTauri()) {
        this.state.set({
          status: 'engine-unavailable',
          requestedAtUtc: startedAtUtc,
          snapshot: null,
          message: 'native-runtime-required'
        });
        return;
      }

      const permission = await this.ensureLocationPermission();
      if (!permission) {
        this.state.set({
          status: 'permission-required',
          requestedAtUtc: startedAtUtc,
          snapshot: null,
          message: 'location-permission-denied'
        });
        return;
      }

      // Capture the astronomical instant immediately before asking for a fresh fix.
      // A slow first-run permission dialog therefore cannot backdate the chart.
      const capturedAt = new Date();
      const capturedAtMs = capturedAt.getTime();
      const requestedAtUtc = capturedAt.toISOString();
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
      const nowMs = Date.now();

      if (
        !isValidCurrentSkyFix(fix, nowMs, CURRENT_SKY_MAX_FIX_AGE_MS) ||
        Math.abs(fix.measuredAtMs - capturedAtMs) > CURRENT_SKY_MAX_FIX_AGE_MS
      ) {
        this.state.set({
          status: 'location-unavailable',
          requestedAtUtc,
          snapshot: null,
          message: 'location-fix-invalid-or-not-synchronous-with-request'
        });
        return;
      }

      if (!force && !shouldRefreshCurrentSky(this.baseline, nowMs, fix)) return;

      this.state.set({
        status: 'calculating',
        requestedAtUtc,
        snapshot: null,
        message: null
      });

      const input: CurrentSkyInput = {
        schemaVersion: CURRENT_SKY_CONTRACT_VERSION,
        capturedAtUtc: requestedAtUtc,
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        utcOffsetMinutes: -capturedAt.getTimezoneOffset(),
        latitudeDeg: fix.latitudeDeg,
        longitudeDegEast: fix.longitudeDegEast,
        altitudeMeters: position.coords.altitude,
        locationAccuracyMeters: fix.accuracyMeters
      };

      // Throttle repeated provider calls even when the provider currently fails.
      // An explicit retry and app foreground transition still force a new run.
      this.baseline = {
        lastRequestAtMs: nowMs,
        latitudeDeg: fix.latitudeDeg,
        longitudeDegEast: fix.longitudeDegEast
      };

      const snapshot = await invoke<CurrentSkySnapshot>('calculate_current_sky', { input });
      if (!this.isValidSnapshot(snapshot, input)) {
        this.state.set({
          status: 'failed',
          requestedAtUtc,
          snapshot: null,
          message: 'engine-returned-invalid-snapshot'
        });
        return;
      }

      this.state.set({
        status: 'ready',
        requestedAtUtc,
        snapshot,
        message: null
      });
    } catch (error: unknown) {
      const code = this.errorCode(error);
      const permissionDenied = code.toLowerCase().includes('permission');
      const engineMissing = code.includes('sky_engine_unavailable')
        || code.includes('native-runtime-required');
      this.state.set({
        status: permissionDenied
          ? 'permission-required'
          : engineMissing ? 'engine-unavailable' : 'location-unavailable',
        requestedAtUtc: startedAtUtc,
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
      !snapshot.observer ||
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
