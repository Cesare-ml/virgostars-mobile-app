import { Injectable, signal } from '@angular/core';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { checkPermissions, getCurrentPosition, requestPermissions } from '@tauri-apps/plugin-geolocation';
import { CURRENT_SKY_CONTRACT_VERSION, type CurrentSkyInput, type CurrentSkySnapshot, type CurrentSkyUiState } from './contracts';
import { CURRENT_SKY_MAX_FIX_AGE_MS, isValidCurrentSkyFix, shouldRefreshCurrentSky, type CurrentSkyLocationFix, type CurrentSkyRefreshBaseline } from './refresh-policy';

@Injectable({ providedIn: 'root' })
export class CurrentSkyService {
  readonly state = signal<CurrentSkyUiState>({ status: 'starting', requestedAtUtc: null, snapshot: null, message: null });
  private timer: number | null = null;
  private inFlight = false;
  private started = false;
  private baseline: CurrentSkyRefreshBaseline | null = null;
  private readonly onVisibilityChange = (): void => { if (document.visibilityState === 'visible') void this.refreshNow(true); };

  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (document.visibilityState === 'visible') void this.refreshNow(true);
    // Poll GPS every 15s to detect movement, but run astronomy at most once/minute.
    this.timer = window.setInterval(() => { if (document.visibilityState === 'visible') void this.refreshNow(false); }, 15_000);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  async retry(): Promise<void> {
    this.baseline = null;
    await this.refreshNow(true);
  }

  private async refreshNow(force: boolean): Promise<void> {
    if (this.inFlight || document.visibilityState !== 'visible') return;
    this.inFlight = true;
    let requestedAtUtc = new Date().toISOString();
    try {
      if (!isTauri()) {
        this.state.set({ status: 'engine-unavailable', requestedAtUtc, snapshot: null, message: 'native-runtime-required' });
        return;
      }
      const permission = await this.ensureLocationPermission();
      if (!permission) {
        this.state.set({ status: 'permission-required', requestedAtUtc, snapshot: null, message: 'location-permission-denied' });
        return;
      }

      // Capture the requested instant after the permission dialog, immediately before GPS.
      const capturedAt = new Date();
      const capturedAtMs = capturedAt.getTime();
      requestedAtUtc = capturedAt.toISOString();
      const position = await getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      const fix: CurrentSkyLocationFix = {
        latitudeDeg: position.coords.latitude,
        longitudeDegEast: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        measuredAtMs: position.timestamp
      };
      const nowMs = Date.now();
      if (!isValidCurrentSkyFix(fix, nowMs, CURRENT_SKY_MAX_FIX_AGE_MS) || Math.abs(fix.measuredAtMs - capturedAtMs) > CURRENT_SKY_MAX_FIX_AGE_MS) {
        this.state.set({ status: 'location-unavailable', requestedAtUtc, snapshot: null, message: 'location-fix-invalid-or-not-synchronous-with-request' });
        return;
      }
      if (!force && !shouldRefreshCurrentSky(this.baseline, nowMs, fix)) return;

      this.state.set({ status: 'calculating', requestedAtUtc, snapshot: null, message: null });
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
      // Update before IPC so provider errors do not trigger a 15-second retry loop.
      this.baseline = { lastRequestAtMs: nowMs, latitudeDeg: fix.latitudeDeg, longitudeDegEast: fix.longitudeDegEast };
      const snapshot = await invoke<CurrentSkySnapshot>('calculate_current_sky', { input });
      if (!this.isValidSnapshot(snapshot, input)) {
        this.state.set({ status: 'failed', requestedAtUtc, snapshot: null, message: 'engine-returned-invalid-snapshot' });
        return;
      }
      this.state.set({ status: 'ready', requestedAtUtc, snapshot, message: null });
    } catch (error: unknown) {
      const code = this.errorCode(error);
      const normalized = code.toLowerCase();
      const status = normalized.includes('permission') ? 'permission-required'
        : normalized.includes('sky_engine_unavailable') || normalized.includes('native-runtime-required') ? 'engine-unavailable'
        : 'location-unavailable';
      this.state.set({ status, requestedAtUtc, snapshot: null, message: code });
    } finally {
      this.inFlight = false;
    }
  }

  private async ensureLocationPermission(): Promise<boolean> {
    let permission = await checkPermissions();
    if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') permission = await requestPermissions(['location']);
    return permission.location === 'granted';
  }

  private isValidSnapshot(snapshot: CurrentSkySnapshot | null | undefined, input: CurrentSkyInput): snapshot is CurrentSkySnapshot {
    if (!snapshot || snapshot.schemaVersion !== CURRENT_SKY_CONTRACT_VERSION || snapshot.timezoneId !== input.timezoneId || snapshot.utcOffsetMinutes !== input.utcOffsetMinutes) return false;
    if (!snapshot.observer || Math.abs(snapshot.observer.latitudeDeg - input.latitudeDeg) > 1e-7 || Math.abs(snapshot.observer.longitudeDegEast - input.longitudeDegEast) > 1e-7) return false;
    if (!Number.isFinite(Date.parse(snapshot.calculatedAtUtc)) || Date.parse(snapshot.calculatedAtUtc) > Date.now() + 2_000) return false;
    if (!snapshot.provider?.id || !snapshot.provider.version || !snapshot.provider.ephemeris || !snapshot.provider.timeScale || !snapshot.provider.coordinateFrame || !snapshot.provider.houseSystem) return false;
    if (!Array.isArray(snapshot.positions) || !Array.isArray(snapshot.houseCusps) || snapshot.houseCusps.length !== 12 || !Array.isArray(snapshot.aspects)) return false;
    if (!snapshot.ascendant || !snapshot.midheaven || !isAngleValid(snapshot.ascendant) || !isAngleValid(snapshot.midheaven)) return false;
    if (!snapshot.houseCusps.every(isLongitudeValid)) return false;
    const expected = new Set(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
    const seen = new Set<string>();
    for (const position of snapshot.positions) {
      if (!expected.has(position.body) || seen.has(position.body) || !isLongitudeValid(position.longitudeDeg) || !Number.isFinite(position.latitudeDeg) || typeof position.retrograde !== 'boolean') return false;
      seen.add(position.body);
    }
    if (seen.size !== expected.size) return false;
    return snapshot.aspects.every((aspect) => !!aspect.firstBody && !!aspect.secondBody && !!aspect.aspect && Number.isFinite(aspect.exactAngleDeg) && Number.isFinite(aspect.orbDeg) && aspect.orbDeg >= 0);
  }

  private errorCode(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return 'current-sky-unexpected-error';
  }
}

function isLongitudeValid(value: number): boolean { return Number.isFinite(value) && value >= 0 && value < 360; }
function isAngleValid(angle: { longitudeDeg: number; latitudeDeg: number }): boolean { return isLongitudeValid(angle.longitudeDeg) && Number.isFinite(angle.latitudeDeg); }
