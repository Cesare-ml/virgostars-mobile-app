import { Component, HostListener, OnDestroy, OnInit, signal } from '@angular/core';
import {
  calculateCurrentSky,
  CurrentSkyLocationError,
  getCurrentSkyLocation
} from './current-sky/native-current-sky';
import type {
  ChartBody,
  CurrentSkyRequest,
  CurrentSkyResponse,
  CurrentSkyScreenState
} from './current-sky/current-sky.models';

type Locale = 'it' | 'en';

const messages = {
  it: {
    title: 'Il cielo di adesso',
    subtitle: 'Tema astrologico del momento e del luogo in cui ti trovi.',
    live: 'Cielo corrente · aggiornamento automatico',
    loading: 'Rilevo la posizione e preparo il calcolo…',
    browser: 'Apri VirgoStars Mobile su Android per acquisire la posizione del dispositivo.',
    permission: 'Per calcolare il cielo del luogo attuale serve il permesso di localizzazione. Puoi riprovare dopo averlo concesso.',
    location: 'Posizione non disponibile. Verifica che la localizzazione sia attiva e riprova.',
    engine: 'Il motore effemeridico non è ancora collegato a questa build. Nessun grafico dimostrativo verrà mostrato.',
    renderer: 'Il calcolo è disponibile, ma il renderer astrologico condiviso non è ancora collegato.',
    wheel: 'Longitudini eclittiche calcolate',
    failed: 'Non è stato possibile calcolare il cielo corrente. Nessun dato precedente o simulato viene mostrato.',
    retry: 'Riprova',
    updated: 'Istante del calcolo',
    locationLabel: 'Posizione',
    accuracy: 'Precisione GPS',
    timezone: 'Fuso orario',
    source: 'Motore',
    footer: 'La posizione resta sul dispositivo e viene usata solo per il calcolo locale.',
    powered: 'Powered by VirgoStars'
  },
  en: {
    title: 'The sky right now',
    subtitle: 'Astrological chart for this moment and your current location.',
    live: 'Current sky · automatic refresh',
    loading: 'Finding your location and preparing the calculation…',
    browser: 'Open VirgoStars Mobile on Android to access the device location.',
    permission: 'Location permission is required to calculate the sky for your current place. Retry after granting it.',
    location: 'Location is unavailable. Check that device location is enabled and retry.',
    engine: 'The ephemeris engine is not connected to this build yet. No illustrative chart will be shown.',
    renderer: 'Calculation is available, but the shared astrology chart renderer is not connected yet.',
    wheel: 'Calculated ecliptic longitudes',
    failed: 'The current sky could not be calculated. No stale or simulated data is displayed.',
    retry: 'Retry',
    updated: 'Calculation instant',
    locationLabel: 'Location',
    accuracy: 'GPS accuracy',
    timezone: 'Time zone',
    source: 'Engine',
    footer: 'Your location stays on this device and is used only for local calculation.',
    powered: 'Powered by VirgoStars'
  }
} as const;

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly locale = signal<Locale>('it');
  readonly state = signal<CurrentSkyScreenState>('loading');
  readonly response = signal<CurrentSkyResponse | null>(null);
  readonly request = signal<CurrentSkyRequest | null>(null);
  readonly locationAccuracy = signal<number | null>(null);
  readonly isRefreshing = signal(false);

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private refreshGeneration = 0;

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }

  async refreshCurrentSky(): Promise<void> {
    if (this.isRefreshing()) return;
    this.stopRefreshTimer();
    const generation = ++this.refreshGeneration;
    this.isRefreshing.set(true);
    this.state.set('loading');
    this.response.set(null);
    this.request.set(null);
    this.locationAccuracy.set(null);

    try {
      const fix = await getCurrentSkyLocation();
      if (this.destroyed || generation !== this.refreshGeneration) return;
      // The fix must be fresh, but the sky must be calculated for NOW, not
      // the moment when the GPS receiver measured the coordinates.
      const nowMs = Date.now();
      if (!Number.isFinite(fix.measuredAtMs) || fix.measuredAtMs > nowMs + 2_000 || nowMs - fix.measuredAtMs > 45_000) {
        this.state.set('location-unavailable');
        return;
      }

      const request: CurrentSkyRequest = {
        instantUtc: new Date(nowMs).toISOString(),
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        latitude: fix.latitude,
        longitude: fix.longitude,
        locationAccuracyMeters: fix.accuracyMeters
      };
      this.request.set(request);
      this.locationAccuracy.set(fix.accuracyMeters);

      const response = await calculateCurrentSky(request);
      if (this.destroyed || generation !== this.refreshGeneration) return;
      if (response.schemaVersion !== 1) {
        this.state.set('failed');
        return;
      }
      this.response.set(response);

      if (response.status === 'unavailable') {
        this.state.set(response.errorCode === 'ephemeris_provider_not_configured'
          ? 'engine-unavailable' : 'failed');
        return;
      }
      if (response.status !== 'ready' || response.chart === null || response.engine === null) {
        this.state.set('failed');
        return;
      }

      // Render only validated, provider-computed coordinates; never a fixture.
      this.state.set('ready');
    } catch (error: unknown) {
      if (this.destroyed || generation !== this.refreshGeneration) return;
      if (error instanceof CurrentSkyLocationError) {
        if (error.code === 'native-runtime-required') this.state.set('browser-preview');
        else this.state.set(error.code === 'permission-denied'
          ? 'permission-denied' : 'location-unavailable');
      } else {
        this.state.set('failed');
      }
    } finally {
      if (this.destroyed || generation !== this.refreshGeneration) return;
      this.isRefreshing.set(false);
      // Refresh foreground location and sky even while the provider is unavailable.
      if (document.visibilityState === 'visible') this.startRefreshTimer();
    }
  }

  wheelX(longitudeDeg: number): number {
    return 160 + 114 * Math.cos((longitudeDeg - 90) * Math.PI / 180);
  }

  wheelY(longitudeDeg: number): number {
    return 160 + 114 * Math.sin((longitudeDeg - 90) * Math.PI / 180);
  }

  bodySymbol(body: ChartBody): string {
    const symbols: Record<string, string> = {
      sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂',
      jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇'
    };
    return symbols[body.id] ?? body.id.slice(0, 2).toUpperCase();
  }

  localDateTime(isoUtc: string): string {
    const timeZone = this.request()?.timezoneId || 'UTC';
    return new Date(isoUtc).toLocaleString(this.locale() === 'it' ? 'it-IT' : 'en-GB', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'medium'
    });
  }

  ngOnInit(): void {
    if (document.visibilityState === 'visible') void this.refreshCurrentSky();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      if (!this.isRefreshing()) void this.refreshCurrentSky();
    } else {
      this.refreshGeneration++;
      this.isRefreshing.set(false);
      this.stopRefreshTimer();
      // Never expose an old chart as live when the app is resumed.
      this.response.set(null);
      this.request.set(null);
      this.locationAccuracy.set(null);
      this.state.set('loading');
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.refreshGeneration++;
    this.stopRefreshTimer();
  }

  private startRefreshTimer(): void {
    this.stopRefreshTimer();
    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refreshCurrentSky();
    }, 60_000);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
