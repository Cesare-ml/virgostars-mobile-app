import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import {
  calculateCurrentSky,
  CURRENT_SKY_REFRESH_MS,
  ZODIAC_GLYPHS,
  ZODIAC_SIGNS_IT,
  type CurrentSkySnapshot
} from './current-sky-engine.mjs';
import { layoutPlanetMarkers, needsSkyRefresh } from './current-sky-view.mjs';

type Locale = 'it' | 'en';
const ZODIAC_SIGNS_EN = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

const BODY_NAMES_EN: Record<string, string> = {
  sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus',
  neptune: 'Neptune', pluto: 'Pluto'
};

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly locale = signal<Locale>('it');
  readonly now = signal(new Date());
  readonly snapshot = signal<CurrentSkySnapshot | null>(null);
  readonly calculatedAt = signal<Date | null>(null);
  readonly error = signal<string | null>(null);
  readonly refreshing = signal(false);
  private refreshTimer?: ReturnType<typeof setInterval>;
  private clockTimer?: ReturnType<typeof setInterval>;

  readonly zodiac = ZODIAC_GLYPHS.map((glyph, index) => {
    const boundaryAngle = (index * 30 - 90) * Math.PI / 180;
    const labelAngle = (index * 30 + 15 - 90) * Math.PI / 180;
    return Object.freeze({
      glyph,
      name: ZODIAC_SIGNS_IT[index],
      x: 180 + Math.cos(labelAngle) * 147,
      y: 180 + Math.sin(labelAngle) * 147,
      x1: 180 + Math.cos(boundaryAngle) * 132,
      y1: 180 + Math.sin(boundaryAngle) * 132,
      x2: 180 + Math.cos(boundaryAngle) * 166,
      y2: 180 + Math.sin(boundaryAngle) * 166
    });
  });

  readonly chartMarkers = computed(() => layoutPlanetMarkers(this.snapshot()?.bodies ?? []));

  readonly positions = computed(() => (this.snapshot()?.bodies ?? []).map(body => ({
    ...body,
    displayName: this.locale() === 'it' ? body.name : BODY_NAMES_EN[body.id],
    displaySign: (this.locale() === 'it' ? ZODIAC_SIGNS_IT : ZODIAC_SIGNS_EN)[body.signIndex]
  })));

  readonly formattedNow = computed(() => new Intl.DateTimeFormat(
    this.locale() === 'it' ? 'it-IT' : 'en-GB',
    { dateStyle: 'full', timeStyle: 'medium' }
  ).format(this.now()));

  readonly formattedCalculation = computed(() => {
    const value = this.calculatedAt();
    return value ? new Intl.DateTimeFormat(
      this.locale() === 'it' ? 'it-IT' : 'en-GB',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    ).format(value) : '—';
  });

  ngOnInit(): void {
    this.refreshSky();
    this.clockTimer = setInterval(() => this.now.set(new Date()), 1_000);
    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refreshSky();
    }, CURRENT_SKY_REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.clockTimer !== undefined) clearInterval(this.clockTimer);
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.now.set(new Date());
      this.refreshSky();
    }
  }

  @HostListener('window:pageshow')
  onPageShow(): void {
    this.now.set(new Date());
    const lastCalculation = this.calculatedAt();
    if (needsSkyRefresh(lastCalculation, new Date(), CURRENT_SKY_REFRESH_MS)) {
      this.refreshSky();
    }
  }

  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }

  refreshSky(): void {
    this.now.set(new Date());
    this.refreshing.set(true);
    try {
      const instant = new Date();
      this.snapshot.set(calculateCurrentSky(instant));
      this.calculatedAt.set(instant);
      this.error.set(null);
    } catch {
      this.snapshot.set(null);
      this.error.set(this.locale() === 'it'
        ? 'Non è stato possibile calcolare il cielo. Riprova.'
        : 'The sky could not be calculated. Please try again.');
    } finally {
      this.refreshing.set(false);
    }
  }

  formatDegree(value: number): string {
    return `${value.toFixed(1)}°`;
  }

  get title(): string {
    return this.locale() === 'it' ? 'Il cielo di adesso' : 'The sky right now';
  }

  get subtitle(): string {
    return this.locale() === 'it'
      ? 'La carta astrologica del momento, calcolata in locale.'
      : 'The astrological chart for this moment, calculated on device.';
  }
}
