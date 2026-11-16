import { Component, HostListener, OnDestroy, OnInit, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import {
  calculateCurrentSky,
  CurrentSkyLocationError,
  getCurrentSkyLocation
} from './current-sky/native-current-sky';
import type {
  CurrentSkyRequest,
  CurrentSkyResponse,
  CurrentSkyScreenState
} from './current-sky/current-sky.models';

type Locale = 'it' | 'en';
type RuntimeInfo = { platform: string; mode: string; schema_version: number };

const messages = {
  it: {
    title: 'Il cielo di adesso',
    subtitle: 'Tema astrologico del momento e del luogo in cui ti trovi.',
    loading: 'Rilevo la posizione e preparo il calcolo…',
    browser: 'Apri VirgoStars Mobile su Android per acquisire la posizione del dispositivo.',
    permission: 'Per calcolare il cielo del luogo attuale serve il permesso di localizzazione. Puoi riprovare dopo averlo concesso.',
    location: 'Posizione non disponibile. Verifica che la localizzazione sia attiva e riprova.',
    engine: 'Il motore effemeridico non è ancora collegato a questa build. Nessun grafico dimostrativo verrà mostrato.',
    renderer: 'Il calcolo è disponibile, ma il renderer astrologico condiviso non è ancora collegato.',
    failed: 'Non è stato possibile calcolare il cielo corrente. Nessun dato precedente o simulato viene mostrato.',
    retry: 'Riprova',
    updated: 'Istante del calcolo',
    locationLabel: 'Posizione',
    accuracy: 'Precisione GPS',
    timezone: 'Fuso orario',
    source: 'Motore',
    awaiting: 'In attesa del motore astronomico',
    live: 'Aggiornamento automatico mentre l’app è aperta',
    footer: 'La posizione resta sul dispositivo e viene usata solo per il calcolo locale.',
    powered: 'Powered by VirgoStars'
  },
  en: {
    title: 'The sky right now',
    subtitle: 'Astrological chart for this moment and your current location.',
    loading: 'Finding your location and preparing the calculation…',
    browser: 'Open VirgoStars Mobile on Android to access the device location.',
    permission: 'Location permission is required to calculate the sky for your current place. Retry after granting it.',
    location: 'Location is unavailable. Check that device location is enabled and retry.',
    engine: 'The ephemeris engine is not connected to this build yet. No illustrative chart will be shown.',
    renderer: 'Calculation is available, but the shared astrology chart renderer is not connected yet.',
    failed: 'The current sky could not be calculated. No stale or simulated data is displayed.',
    retry: 'Retry',
    updated: 'Calculation instant',
    locationLabel: 'Location',
    accuracy: 'GPS accuracy',
    timezone: 'Time zone',
    source: 'Engine',
    awaiting: 'Waiting for the astronomical engine',
    live: 'Automatically refreshes while the app is open',
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
  readonly runtime = signal<string | null>(null);

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

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
    this.isRefreshing.set(true);
    this.state.set('loading');
    this.response.set(null);

    try {
      const fix = await getCurrentSkyLocation();
      // Use the fix timestamp as the chart instant so time and place describe
      // the same observed moment, rather than the later completion of the GPS call.
      const instant = new Date(fix.measuredAtMs);
      if (!Number.isFinite(instant.getTime()) || Math.abs(Date.now() - fix.measuredAtMs) > 45_000) {
        this.state.set('location-unavailable');
        return;
      }

      const request: CurrentSkyRequest = {
        instantUtc: instant.toISOString(),
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        latitude: fix.latitude,
        longitude: fix.longitude,
        locationAccuracyMeters: fix.accuracyMeters
      };
      this.request.set(request);
      this.locationAccuracy.set(fix.accuracyMeters);

      const response = await calculateCurrentSky(request);
      this.response.set(response);

      if (response.status === 'unavailable') {
        this.state.set(response.errorCode === 'ephemeris_provider_not_configured'
          ? 'engine-unavailable' : 'failed');
        return;
      }
      if (response.status !== 'ready' || response.chart === null) {
        this.state.set('failed');
        return;
      }

      // Never claim that a chart is visible until the shared renderer is wired.
      this.state.set('renderer-unavailable');
    } catch (error: unknown) {
      if (error instanceof CurrentSkyLocationError) {
        this.state.set(error.code === 'permission-denied'
          ? 'permission-denied' : 'location-unavailable');
      } else {
        this.state.set('failed');
      }
    } finally {
      this.isRefreshing.set(false);
      if (this.state() === 'renderer-unavailable') this.startRefreshTimer();
    }
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
    invoke<RuntimeInfo>('runtime_info')
      .then(info => {
        if (info.schema_version === 1) this.runtime.set(info.platform);
      })
      .catch(() => this.runtime.set('browser-preview'));
    if (document.visibilityState === 'visible') void this.refreshCurrentSky();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      void this.refreshCurrentSky();
    } else {
      this.stopRefreshTimer();
    }
  }

  ngOnDestroy(): void {
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
