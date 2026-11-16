import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CurrentSkyService } from './current-sky/current-sky.service';

type Locale = 'it' | 'en';

const messages = {
  it: {
    eyebrow: 'CIELO IN TEMPO REALE',
    title: 'Il cielo di adesso',
    subtitle: 'Il tema astrologico del luogo e dell’istante in cui ti trovi.',
    permission: 'Per calcolare il cielo serve il permesso di posizione. Le coordinate restano sul dispositivo.',
    location: 'La posizione attuale non è disponibile o il fix è troppo vecchio. Riprova quando il GPS è disponibile.',
    calculating: 'Acquisizione della posizione e calcolo del cielo…',
    unavailable: 'Motore astronomico non ancora collegato',
    unavailableBody: 'La schermata non mostrerà posizioni di esempio. Il provider astronomico e le librerie astrologiche devono essere integrati e validati prima di disegnare il tema.',
    failure: 'Non è stato possibile verificare il risultato. Nessun grafico verrà mostrato.',
    retry: 'Riprova',
    lastRequest: 'Istante richiesto',
    timezone: 'Fuso orario',
    coordinates: 'Coordinate',
    accuracy: 'Precisione GPS',
    calculated: 'Calcolato',
    rendererMissing: 'Calcolo ricevuto; integrazione del renderer condiviso ancora da completare.',
    attribution: 'Powered by VirgoStars'
  },
  en: {
    eyebrow: 'LIVE SKY',
    title: 'The sky right now',
    subtitle: 'The astrological chart for your current place and instant.',
    permission: 'Location permission is required to calculate the sky. Coordinates stay on this device.',
    location: 'The current location is unavailable or the fix is stale. Try again when GPS is available.',
    calculating: 'Acquiring location and calculating the sky…',
    unavailable: 'Astronomical engine not connected yet',
    unavailableBody: 'No sample positions will be shown. The astronomical provider and astrology libraries must be integrated and validated before rendering a chart.',
    failure: 'The result could not be verified. No chart will be displayed.',
    retry: 'Retry',
    lastRequest: 'Requested instant',
    timezone: 'Time zone',
    coordinates: 'Coordinates',
    accuracy: 'GPS accuracy',
    calculated: 'Calculated',
    rendererMissing: 'Calculation received; shared chart renderer integration is still pending.',
    attribution: 'Powered by VirgoStars'
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

  constructor(readonly currentSky: CurrentSkyService) {}

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }

  retry(): void {
    void this.currentSky.retry();
  }

  formatInstant(value: string | null): string {
    if (!value) return '—';
    const locale = this.locale() === 'it' ? 'it-IT' : 'en-GB';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    }).format(new Date(value));
  }

  ngOnInit(): void {
    this.currentSky.start();
  }

  ngOnDestroy(): void {
    this.currentSky.stop();
  }
}
