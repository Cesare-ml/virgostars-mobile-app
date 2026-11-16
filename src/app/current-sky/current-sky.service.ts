import { Injectable, signal } from '@angular/core';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { checkPermissions, getCurrentPosition, requestPermissions } from '@tauri-apps/plugin-geolocation';
import { CURRENT_SKY_CONTRACT_VERSION, type CurrentSkyInput, type CurrentSkySnapshot, type CurrentSkyUiState } from './contracts';
import { CURRENT_SKY_MAX_FIX_AGE_MS, isValidCurrentSkyFix, shouldRefreshCurrentSky, type CurrentSkyLocationFix, type CurrentSkyRefreshBaseline } from './refresh-policy';

@Injectable({ providedIn: 'root' })
export class CurrentSkyService {
  readonly state = signal<CurrentSkyUiState>({ status: 'permission-required', requestedAtUtc: null, snapshot: null, message: 'location-consent-required' });
  private timer: number | null = null;
  private inFlight = false;
  private lifecycleGeneration = 0;
  private pendingForegroundRefresh = false;
  private calculationStarted = false;
  private started = false;
  private pollingStarted = false;
  private baseline: CurrentSkyRefreshBaseline | null = null;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      this.lifecycleGeneration++;
      this.pendingForegroundRefresh = this.pollingStarted;
      return;
    }
    if (this.pollingStarted) {
      this.pendingForegroundRefresh = true;
      void this.refreshNow(true, false);
    }
  };

  /** Show rationale first; Android permission is requested only after an explicit tap. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.lifecycleGeneration++;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // No location permission prompt, GPS request or timer before user consent.
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.lifecycleGeneration++;
    this.pendingForegroundRefresh = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopPolling();
  }

  private stopPolling(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.pollingStarted = false;
  }

  /** Called by the explicit rationale CTA; this is the only path that opens a permission prompt. */
  async retry(): Promise<void> {
    this.baseline = null;
    await this.refreshNow(true, true);
  }

  private startPolling(): void {
    if (this.pollingStarted) return;
    this.pollingStarted = true;
    this.timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.refreshNow(false, false);
    }, 15_000);
  }

  private async refreshNow(force: boolean, requestPermission: boolean): Promise<void> {
    if (!this.started || document.visibilityState !== 'visible') return;
    if (this.inFlight) {
      if (force) this.pendingForegroundRefresh = true;
      return;
    }
    this.inFlight = true;
    this.calculationStarted = false;
    const generation = this.lifecycleGeneration;
    const isActive = (): boolean => this.started && generation === this.lifecycleGeneration && document.visibilityState === 'visible';
    let requestedAtUtc = new Date().toISOString();
    try {
      if (!isTauri()) {
        this.state.set({ status: 'engine-unavailable', requestedAtUtc, snapshot: null, message: 'native-runtime-required' });
        return;
      }
      const permission = await this.ensureLocationPermission(requestPermission);
      if (!isActive()) return;
      if (!permission) {
        this.stopPolling();
        this.state.set({ status: 'permission-required', requestedAtUtc, snapshot: null, message: 'location-permission-denied' });
        return;
      }
      this.startPolling();
      if (!isActive()) return;

      // Capture the calculation instant after the GPS fix, not before its potentially long wait.
      const gpsRequestStartedAtMs = Date.now();
      const position = await getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      if (!isActive()) return;
      const capturedAt = new Date();
      requestedAtUtc = capturedAt.toISOString();
      const fix: CurrentSkyLocationFix = { latitudeDeg: position.coords.latitude, longitudeDegEast: position.coords.longitude, accuracyMeters: position.coords.accuracy, measuredAtMs: position.timestamp };
      const nowMs = Date.now();
      if (!isValidCurrentSkyFix(fix, nowMs, CURRENT_SKY_MAX_FIX_AGE_MS) || fix.measuredAtMs < gpsRequestStartedAtMs - CURRENT_SKY_MAX_FIX_AGE_MS) {
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
      this.calculationStarted = true;
      const snapshot = await invoke<CurrentSkySnapshot>('calculate_current_sky', { input });
      if (!isActive()) return;
      if (!this.isValidSnapshot(snapshot, input)) {
        this.state.set({ status: 'failed', requestedAtUtc, snapshot: null, message: 'engine-returned-invalid-snapshot' });
        return;
      }
      this.baseline = { lastRequestAtMs: nowMs, latitudeDeg: fix.latitudeDeg, longitudeDegEast: fix.longitudeDegEast };
      this.state.set({ status: 'ready', requestedAtUtc, snapshot, message: null });
    } catch (error: unknown) {
      if (!isActive()) return;
      const code = this.errorCode(error);
      const normalized = code.toLowerCase();
      const status = normalized.includes('permission') ? 'permission-required'
        : normalized.includes('sky_engine_unavailable') || normalized.includes('native-runtime-required') ? 'engine-unavailable'
        : this.calculationStarted ? 'failed' : 'location-unavailable';
      if (status === 'permission-required') this.stopPolling();
      this.state.set({ status, requestedAtUtc, snapshot: null, message: code });
    } finally {
      this.inFlight = false;
      this.calculationStarted = false;
      if (this.pendingForegroundRefresh && this.started && document.visibilityState === 'visible') {
        this.pendingForegroundRefresh = false;
        void this.refreshNow(true, false);
      }
    }
  }

  private async ensureLocationPermission(askUser: boolean): Promise<boolean> {
    let permission = await checkPermissions();
    if (askUser && (permission.location === 'prompt' || permission.location === 'prompt-with-rationale')) {
      permission = await requestPermissions(['location']);
    }
    return permission.location === 'granted';
  }

  private isValidSnapshot(snapshot: CurrentSkySnapshot | null | undefined, input: CurrentSkyInput): snapshot is CurrentSkySnapshot {
    if (!snapshot || snapshot.schemaVersion !== CURRENT_SKY_CONTRACT_VERSION || snapshot.timezoneId !== input.timezoneId || snapshot.utcOffsetMinutes !== input.utcOffsetMinutes) return false;
    if (!snapshot.observer || Math.abs(snapshot.observer.latitudeDeg - input.latitudeDeg) > 1e-7 || Math.abs(snapshot.observer.longitudeDegEast - input.longitudeDegEast) > 1e-7) return false;
    const calculatedAtMs = Date.parse(snapshot.calculatedAtUtc);
    const requestedAtMs = Date.parse(input.capturedAtUtc);
    if (!Number.isFinite(calculatedAtMs) || !Number.isFinite(requestedAtMs) || Math.abs(calculatedAtMs - requestedAtMs) > 2_000 || calculatedAtMs > Date.now() + 2_000) return false;
    if (!snapshot.provider?.id || !snapshot.provider.version || !snapshot.provider.ephemeris || !snapshot.provider.timeScale || !snapshot.provider.coordinateFrame || !snapshot.provider.houseSystem || !Array.isArray(snapshot.provider.limitations)) return false;
    if (snapshot.provider.zodiac !== 'tropical' && snapshot.provider.zodiac !== 'sidereal') return false;
    if (!Array.isArray(snapshot.positions) || !Array.isArray(snapshot.houseCusps) || snapshot.houseCusps.length !== 12 || !Array.isArray(snapshot.aspects)) return false;
    if (!snapshot.ascendant || !snapshot.midheaven || !isAngleValid(snapshot.ascendant) || !isAngleValid(snapshot.midheaven)) return false;
    if (!snapshot.houseCusps.every(isLongitudeValid)) return false;
    const expected = new Set(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
    const seen = new Set<string>();
    for (const position of snapshot.positions) {
      if (!expected.has(position.body) || seen.has(position.body) || !isLongitudeValid(position.longitudeDeg) || !Number.isFinite(position.latitudeDeg) || (position.retrograde !== null && typeof position.retrograde !== 'boolean')) return false;
      seen.add(position.body);
    }
    if (seen.size !== expected.size) return false;
    const aspectBodies = new Set([...expected, 'ascendant', 'midheaven']);
    return snapshot.aspects.every((aspect) => aspectBodies.has(aspect.firstBody) && aspectBodies.has(aspect.secondBody) && !!aspect.aspect && Number.isFinite(aspect.exactAngleDeg) && aspect.exactAngleDeg >= 0 && aspect.exactAngleDeg <= 360 && Number.isFinite(aspect.orbDeg) && aspect.orbDeg >= 0 && (aspect.applying === null || typeof aspect.applying === 'boolean'));
  }

  private errorCode(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return 'current-sky-unexpected-error';
  }
}
function isLongitudeValid(value: number): boolean { return Number.isFinite(value) && value >= 0 && value < 360; }
function isAngleValid(angle: { longitudeDeg: number; latitudeDeg: number }): boolean { return isLongitudeValid(angle.longitudeDeg) && Number.isFinite(angle.latitudeDeg) && angle.latitudeDeg >= -90 && angle.latitudeDeg <= 90; }
