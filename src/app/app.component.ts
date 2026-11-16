import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

type Locale = 'it' | 'en';
type PlanetPosition = {
  body: string; symbol: string; longitudeDeg: number; latitudeDeg: number;
  signIndex: number; signDegree: number; retrograde: boolean;
};
type SkyChart = {
  schemaVersion: number; calculatedAtUnixMs: number; source: string;
  method: string; referenceFrame: string; limitations: string[];
  positions: PlanetPosition[];
};

const messages = {
  it: {
    eyebrow: 'IL CIELO IN TEMPO REALE', title: 'Il cielo adesso',
    subtitle: 'La fotografia astrologica del cielo nel momento presente.',
    loading: 'Calcolo delle posizioni celesti…', retry: 'Riprova', refresh: 'Aggiorna',
    updated: 'Aggiornato', source: 'Motore di calcolo', skyPositions: 'Posizioni planetarie',
    zodiac: 'Zodiaco tropicale', retrograde: 'Retrogrado',
    disclaimer: 'Modello astronomico temporaneo',
    limitations: 'Posizioni geocentriche eclittiche. Nessun Ascendente o sistema di case: non viene richiesta la posizione del dispositivo.',
    notPersonal: 'È il tema del cielo del momento, non un tema natale personale.',
    unavailable: 'Impossibile calcolare il cielo. Verifica che il motore nativo sia disponibile e riprova.',
    footer: 'Powered by VirgoStars',
    signs: ['Ariete', 'Toro', 'Gemelli', 'Cancro', 'Leone', 'Vergine', 'Bilancia', 'Scorpione', 'Sagittario', 'Capricorno', 'Acquario', 'Pesci'],
    bodies: { Sun: 'Sole', Moon: 'Luna', Mercury: 'Mercurio', Venus: 'Venere', Mars: 'Marte', Jupiter: 'Giove', Saturn: 'Saturno', Uranus: 'Urano', Neptune: 'Nettuno' }
  },
  en: {
    eyebrow: 'THE SKY IN REAL TIME', title: 'The sky right now',
    subtitle: 'An astrological snapshot of the sky at this moment.',
    loading: 'Calculating celestial positions…', retry: 'Try again', refresh: 'Refresh',
    updated: 'Updated', source: 'Calculation engine', skyPositions: 'Planetary positions',
    zodiac: 'Tropical zodiac', retrograde: 'Retrograde',
    disclaimer: 'Temporary astronomical model',
    limitations: 'Geocentric ecliptic positions. No Ascendant or house system: device location is not requested.',
    notPersonal: 'This is the chart of the current sky, not a personal birth chart.',
    unavailable: 'Unable to calculate the sky. Check that the native engine is available and try again.',
    footer: 'Powered by VirgoStars',
    signs: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'],
    bodies: { Sun: 'Sun', Moon: 'Moon', Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune' }
  }
} as const;

const ZODIAC_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

@Component({
  selector: 'app-root', standalone: true,
  templateUrl: './app.component.html', styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly locale = signal<Locale>('it');
  readonly chart = signal<SkyChart | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly refreshing = signal(false);
  readonly zodiacSigns = ZODIAC_GLYPHS;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key] as string;
  }
  bodyName(body: string): string {
    const names = messages[this.locale()].bodies as Record<string, string>;
    return names[body] ?? body;
  }
  signName(index: number): string {
    return messages[this.locale()].signs[index] ?? '';
  }
  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }
  formattedDate(): string {
    const timestamp = this.chart()?.calculatedAtUnixMs;
    return timestamp ? new Intl.DateTimeFormat(this.locale() === 'it' ? 'it-IT' : 'en-GB', {
      dateStyle: 'medium', timeStyle: 'medium'
    }).format(new Date(timestamp)) : '';
  }
  signX(index: number): number {
    const angle = (index * 30 + 15 - 90) * Math.PI / 180;
    return 160 + Math.cos(angle) * 143;
  }
  signY(index: number): number {
    const angle = (index * 30 + 15 - 90) * Math.PI / 180;
    return 160 + Math.sin(angle) * 143;
  }
  planetX(position: PlanetPosition): number {
    const angle = (position.longitudeDeg - 90) * Math.PI / 180;
    return 160 + Math.cos(angle) * 105;
  }
  planetY(position: PlanetPosition): number {
    const angle = (position.longitudeDeg - 90) * Math.PI / 180;
    return 160 + Math.sin(angle) * 105;
  }
  degreeLabel(value: number): string {
    return value.toFixed(1).replace('.', this.locale() === 'it' ? ',' : '.') + '°';
  }
  async refreshSky(): Promise<void> {
    this.refreshing.set(true);
    this.error.set(null);
    try {
      const result = await invoke<SkyChart>('current_sky_chart');
      if (result.schemaVersion !== 1 || !Array.isArray(result.positions) || result.positions.length !== 9) {
        throw new Error('Unsupported chart contract');
      }
      this.chart.set(result);
    } catch {
      this.error.set(this.t('unavailable'));
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }
  ngOnInit(): void {
    void this.refreshSky();
    this.refreshTimer = setInterval(() => void this.refreshSky(), 60_000);
  }
  ngOnDestroy(): void {
    if (this.refreshTimer !== null) clearInterval(this.refreshTimer);
  }
}
