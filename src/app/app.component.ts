import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CurrentSkyBody, CurrentSkyService, CurrentSkySnapshot } from './current-sky.service';

interface ZodiacLabel {
  readonly glyph: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly snapshot = signal<CurrentSkySnapshot | null>(null);
  readonly error = signal<string | null>(null);
  readonly isRefreshing = signal(false);
  readonly clock = signal(new Date());
  readonly clockLabel = computed(() => this.clock().toLocaleString('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }));
  readonly zodiacLabels: readonly ZodiacLabel[];
  readonly bodies = computed<readonly CurrentSkyBody[]>(() => this.snapshot()?.bodies ?? []);
  readonly orderedBodies = computed(() => [...this.bodies()].sort((a, b) => a.longitude - b.longitude));

  private refreshHandle: ReturnType<typeof setInterval> | undefined;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.refresh();
      this.startRefreshTimer();
    } else {
      this.stopRefreshTimer();
    }
  };

  constructor(private readonly sky: CurrentSkyService) {
    this.zodiacLabels = sky.zodiac.map((sign, index) => {
      const angle = (index * 30 + 15 - 90) * Math.PI / 180;
      return {
        glyph: sign.glyph,
        name: sign.name,
        x: 160 + Math.cos(angle) * 83,
        y: 160 + Math.sin(angle) * 83
      };
    });
  }

  ngOnInit(): void {
    this.refresh();
    // Planetary motion is slow; refresh every 30 seconds to keep the timestamp
    // live without wasting battery on per-frame recalculation.
    this.startRefreshTimer();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopRefreshTimer();
  }

  private startRefreshTimer(): void {
    this.stopRefreshTimer();
    if (document.visibilityState === 'visible') {
      this.refreshHandle = setInterval(() => this.refresh(), 30_000);
    }
  }

  private stopRefreshTimer(): void {
    if (this.refreshHandle !== undefined) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = undefined;
    }
  }

  refresh(): void {
    if (this.isRefreshing()) return;
    this.isRefreshing.set(true);
    try {
      const instant = new Date();
      this.snapshot.set(this.sky.calculate(instant));
      this.clock.set(instant);
      this.error.set(null);
    } catch (cause) {
      // Never leave stale or synthetic placements on screen after a failure.
      this.snapshot.set(null);
      this.error.set(cause instanceof Error ? cause.message : 'Calcolo astronomico non disponibile.');
    } finally {
      this.isRefreshing.set(false);
    }
  }

  formatLongitude(body: CurrentSkyBody): string {
    const degrees = Math.floor(body.degreeInSign);
    const minutes = Math.floor((body.degreeInSign - degrees) * 60);
    return `${String(degrees).padStart(2, '0')}° ${String(minutes).padStart(2, '0')}′ ${body.sign}`;
  }

  trackBody(_index: number, body: CurrentSkyBody): string {
    return body.id;
  }
}
