import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { getCurrentLocation } from './live-sky/native-location';
import { readLiveSkySnapshot, type LiveSkySnapshot } from './live-sky/live-sky-session';

type Locale = 'it' | 'en';
type ViewStatus = 'loading' | 'ready' | 'permission-denied' | 'browser-preview' | 'location-unavailable';

const messages = {
  it: {
    title: 'Il cielo di adesso',
    subtitle: 'Il tema astrologico del luogo in cui ti trovi, riferito all’istante presente.',
    privacy: 'La posizione viene richiesta solo mentre l’app è aperta e resta sul dispositivo. Non viene inviata a un server.',
    loading: 'Acquisizione della posizione…',
    ready: 'Posizione acquisita',
    permissionDenied: 'Permesso di localizzazione non concesso. Concedilo dalle impostazioni Android e riprova.',
    browserPreview: 'La geolocalizzazione nativa è disponibile nella versione Android, non nell’anteprima browser.',
    locationUnavailable: 'Posizione non disponibile o non sufficientemente recente. Verifica il GPS e riprova.',
    accuracy: 'Precisione stimata',
    measured: 'Fix GPS',
    chartPending: 'Calcolo astrologico non ancora disponibile',
    chartPendingBody: 'Il provider astronomico e il renderer condiviso non hanno ancora superato le verifiche necessarie. Per questo non mostriamo un grafico simulato.',
    retry: 'Aggiorna il cielo',
    updating: 'Aggiornamento…',
    powered: 'Powered by VirgoStars'
  },
  en: {
    title: 'The sky right now',
    subtitle: 'The astrological chart for your current location and the present instant.',
    privacy: 'Location is requested only while the app is open and stays on this device. It is never sent to a server.',
    loading: 'Acquiring location…',
    ready: 'Location acquired',
    permissionDenied: 'Location permission was not granted. Enable it in Android settings and try again.',
    browserPreview: 'Native geolocation is available in the Android app, not in the browser preview.',
    locationUnavailable: 'Location is unavailable or too old. Check GPS and try again.',
    accuracy: 'Estimated accuracy',
    measured: 'GPS fix',
    chartPending: 'Astrological calculation is not available yet',
    chartPendingBody: 'The astronomy provider and shared chart renderer have not passed their required validation gates. No simulated chart is displayed.',
    retry: 'Refresh the sky',
    updating: 'Refreshing…',
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
  readonly status = signal<ViewStatus>('loading');
  readonly snapshot = signal<LiveSkySnapshot | null>(null);
  readonly refreshing = signal(false);

  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private refreshPending = false;

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') void this.refresh();
  };

  private readonly onWindowFocus = (): void => {
    if (document.visibilityState === 'visible') void this.refresh();
  };

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }

  formatInstant(value: string, timezoneId: string): string {
    return new Date(value).toLocaleString(
      this.locale() === 'it' ? 'it-IT' : 'en-GB',
      { timeZone: timezoneId, dateStyle: 'full', timeStyle: 'medium' }
    );
  }

  async refresh(): Promise<void> {
    if (document.visibilityState !== 'visible') return;
    if (this.refreshing()) {
      this.refreshPending = true;
      return;
    }

    this.refreshing.set(true);
    this.snapshot.set(null);
    this.status.set('loading');

    try {
      const current = await readLiveSkySnapshot(getCurrentLocation);
      if (document.visibilityState === 'visible') {
        this.snapshot.set(current);
        this.status.set('ready');
      } else {
        this.refreshPending = true;
      }
    } catch (error: unknown) {
      if (document.visibilityState === 'visible') {
        const code = error instanceof Error ? error.message : '';
        if (code === 'location-permission-denied') {
          this.status.set('permission-denied');
        } else if (code === 'native-only') {
          this.status.set('browser-preview');
        } else {
          this.status.set('location-unavailable');
        }
      } else {
        this.refreshPending = true;
      }
    } finally {
      this.refreshing.set(false);
      if (this.refreshPending && document.visibilityState === 'visible') {
        this.refreshPending = false;
        queueMicrotask(() => void this.refresh());
      }
    }
  }

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('focus', this.onWindowFocus);
    void this.refresh();
    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, 60_000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('focus', this.onWindowFocus);
  }
}
