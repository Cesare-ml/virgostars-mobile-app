import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { LiveSkyService, ZODIAC_SIGNS, type SkySnapshot } from './live-sky.service';

type Locale = 'it' | 'en';
type RuntimeInfo = { platform: string; mode: string; schema_version: number };

const messages = {
  it: {
    eyebrow: 'Cielo in tempo reale', title: 'Il cielo, adesso',
    subtitle: 'La posizione dei pianeti nel cielo di questo istante.',
    geocentric: 'Carta zodiacale tropicale · longitudini geocentriche apparenti',
    updated: 'Aggiornato',
    accuracy: 'Motore temporaneo: accuratezza dichiarata entro 1 minuto d’arco rispetto a NOVAS. Non è ancora il motore VirgoStars.',
    noHouses: 'Questa MVP mostra le posizioni planetarie geocentriche. Ascendente e case, che richiedono una località di osservazione, non sono inclusi.',
    native: 'App Android', browser: 'Anteprima browser', powered: 'Powered by VirgoStars',
    error: 'Impossibile calcolare il cielo. Riprova tra qualche istante.', retry: 'Riprova',
    bodies: 'Posizioni planetarie', loading: 'Calcolo del cielo…',
    bodyNames: { Sun: 'Sole', Moon: 'Luna', Mercury: 'Mercurio', Venus: 'Venere', Mars: 'Marte', Jupiter: 'Giove', Saturn: 'Saturno', Uranus: 'Urano', Neptune: 'Nettuno', Pluto: 'Plutone' },
    signNames: ['Ariete','Toro','Gemelli','Cancro','Leone','Vergine','Bilancia','Scorpione','Sagittario','Capricorno','Acquario','Pesci']
  },
  en: {
    eyebrow: 'Live sky', title: 'The sky, right now',
    subtitle: 'Planetary positions in the sky at this moment.',
    geocentric: 'Tropical zodiac chart · apparent geocentric longitudes',
    updated: 'Updated',
    accuracy: 'Temporary engine: stated accuracy within 1 arcminute against NOVAS. This is not yet the VirgoStars engine.',
    noHouses: 'This MVP shows geocentric planetary positions. Ascendant and houses, which require an observer location, are not included.',
    native: 'Android app', browser: 'Browser preview', powered: 'Powered by VirgoStars',
    error: 'Unable to calculate the sky. Please retry in a moment.', retry: 'Retry',
    bodies: 'Planetary positions', loading: 'Calculating the sky…',
    bodyNames: { Sun: 'Sun', Moon: 'Moon', Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune', Pluto: 'Pluto' },
    signNames: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']
  }
} as const;

@Component({ selector: 'app-root', standalone: true, templateUrl: './app.component.html', styleUrl: './app.component.css' })
export class AppComponent implements OnInit, OnDestroy {
  readonly locale = signal<Locale>('it');
  readonly runtime = signal<string | null>(null);
  readonly sky = signal<SkySnapshot | null>(null);
  readonly failed = signal(false);
  readonly zodiac = ZODIAC_SIGNS;
  private refreshTimer: number | undefined;
  private destroyed = false;
  private lastRefreshAt = 0;
  private refreshIfStale(): void {
    if (document.visibilityState === 'visible' && Date.now() - this.lastRefreshAt >= 1_000) {
      this.refresh();
    }
  }
  private readonly onVisibilityChange = (): void => {
    this.refreshIfStale();
  };
  private readonly onFocus = (): void => {
    this.refreshIfStale();
  };

  readonly chartPoints = computed(() => {
    const bodies = this.sky()?.bodies ?? [];
    return bodies.map((body, index) => {
      const angle = (body.longitude - 90) * Math.PI / 180;
      const previous = bodies[index - 1];
      const gapFromPrevious = previous === undefined
        ? Number.POSITIVE_INFINITY
        : body.longitude - previous.longitude;
      const wrapGap = index === 0 && bodies.length > 1
        ? body.longitude + 360 - bodies[bodies.length - 1].longitude
        : Number.POSITIVE_INFINITY;
      const nearPrevious = Math.min(gapFromPrevious, wrapGap) < 11;
      const radius = nearPrevious ? (index % 2 === 0 ? 84 : 110) : 97;
      return { ...body, x: 160 + Math.cos(angle) * radius, y: 160 + Math.sin(angle) * radius };
    });
  });

  readonly zodiacLabels = this.zodiac.map((sign, index) => {
    const angle = (index * 30 + 15 - 90) * Math.PI / 180;
    return { ...sign, x: 160 + Math.cos(angle) * 137, y: 160 + Math.sin(angle) * 137 };
  });

  constructor(private readonly liveSky: LiveSkyService) {}

  t(key: 'eyebrow' | 'title' | 'subtitle' | 'geocentric' | 'updated' | 'accuracy' | 'noHouses' | 'native' | 'browser' | 'powered' | 'error' | 'retry' | 'bodies' | 'loading'): string {
    return messages[this.locale()][key];
  }
  bodyName(id: string): string {
    return messages[this.locale()].bodyNames[id as keyof typeof messages.it.bodyNames] ?? id;
  }
  signName(index: number): string {
    return messages[this.locale()].signNames[index] ?? '';
  }
  formattedInstant(): string {
    const instant = this.sky()?.instant;
    if (!instant) return '—';
    return new Intl.DateTimeFormat(this.locale() === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'medium' }).format(instant);
  }
  formattedLongitude(value: number): string {
    return value.toFixed(2).replace('.', this.locale() === 'it' ? ',' : '.') + '°';
  }
  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }
  ngOnInit(): void {
    this.destroyed = false;
    this.refresh();
    this.refreshTimer = window.setInterval(() => {
      this.refreshIfStale();
    }, 30_000);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('focus', this.onFocus);
    invoke<RuntimeInfo>('runtime_info')
      .then(info => { if (!this.destroyed && info.schema_version === 1) this.runtime.set(info.platform); })
      .catch(() => { if (!this.destroyed) this.runtime.set(null); });
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.refreshTimer !== undefined) window.clearInterval(this.refreshTimer);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('focus', this.onFocus);
  }
  refresh(): void {
    this.lastRefreshAt = Date.now();
    try { this.sky.set(this.liveSky.calculate(new Date(this.lastRefreshAt))); this.failed.set(false); }
    catch { this.sky.set(null); this.failed.set(true); }
  }
}
