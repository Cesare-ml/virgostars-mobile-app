import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { calculateCurrentSky, ZODIAC_SIGNS } from './current-sky.mjs';
import type { CurrentSky, ZodiacSign } from './current-sky.mjs';

type Locale = 'it' | 'en';

const messages = {
  it: {
    eyebrow: 'CIELO IN TEMPO REALE', title: 'Il cielo di adesso',
    subtitle: 'La carta astrologica del momento, aggiornata automaticamente.',
    live: 'LIVE', calculating: 'Calcolo delle posizioni celesti…',
    errorTitle: 'Carta non disponibile',
    errorBody: 'Non è stato possibile calcolare le posizioni celesti. Riprova tra poco.',
    retry: 'Ricalcola', planets: 'Posizioni planetarie', frame: 'Coordinate geocentriche · zodiaco tropicale',
    updated: 'Aggiornamento', source: 'Motore astronomico provvisorio',
    limitation: 'Questa prima versione mostra le longitudini geocentriche. Ascendente e case, che richiedono la posizione dell’osservatore, saranno aggiunti dopo l’integrazione sicura della localizzazione.',
    footer: 'Powered by VirgoStars'
  },
  en: {
    eyebrow: 'LIVE SKY', title: 'The sky right now',
    subtitle: 'The astrological chart of this moment, refreshed automatically.',
    live: 'LIVE', calculating: 'Calculating celestial positions…',
    errorTitle: 'Chart unavailable',
    errorBody: 'Celestial positions could not be calculated. Please try again shortly.',
    retry: 'Recalculate', planets: 'Planetary positions', frame: 'Geocentric coordinates · tropical zodiac',
    updated: 'Updated', source: 'Temporary astronomy engine',
    limitation: 'This first version displays geocentric longitudes. The Ascendant and houses, which require the observer location, will follow after secure location integration.',
    footer: 'Powered by VirgoStars'
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
  readonly now = signal(new Date());
  readonly sky = signal<CurrentSky | null>(null);
  readonly error = signal(false);
  readonly planets = computed(() => this.sky()?.planets ?? []);
  readonly zodiacMarks = this.createZodiacMarks();
  private ticker?: ReturnType<typeof setInterval>;
  private lastCalculation = 0;

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  name(value: { nameIt: string; nameEn: string } | ZodiacSign): string {
    return this.locale() === 'it'
      ? ('nameIt' in value ? value.nameIt : value.it)
      : ('nameEn' in value ? value.nameEn : value.en);
  }

  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }

  recalculate(): void {
    this.refresh(new Date());
  }

  timeLabel(): string {
    return new Intl.DateTimeFormat(this.locale() === 'it' ? 'it-IT' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(this.now());
  }

  ngOnInit(): void {
    this.refresh(new Date());
    this.ticker = setInterval(() => {
      const instant = new Date();
      this.now.set(instant);
      if (instant.getTime() - this.lastCalculation >= 60_000) this.refresh(instant);
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.ticker) clearInterval(this.ticker);
  }

  private refresh(instant: Date): void {
    this.now.set(instant);
    try {
      this.sky.set(calculateCurrentSky(instant));
      this.lastCalculation = instant.getTime();
      this.error.set(false);
    } catch {
      this.sky.set(null);
      this.error.set(true);
    }
  }

  private createZodiacMarks(): Array<ZodiacSign & {
    x: number; y: number; x1: number; y1: number; x2: number; y2: number;
  }> {
    return ZODIAC_SIGNS.map((sign, index) => {
      const middle = (180 - (index * 30 + 15)) * Math.PI / 180;
      const boundary = (180 - index * 30) * Math.PI / 180;
      return {
        ...sign,
        x: 160 + 127 * Math.cos(middle), y: 160 + 127 * Math.sin(middle),
        x1: 160 + 87 * Math.cos(boundary), y1: 160 + 87 * Math.sin(boundary),
        x2: 160 + 148 * Math.cos(boundary), y2: 160 + 148 * Math.sin(boundary)
      };
    });
  }
}
