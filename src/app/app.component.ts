import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { checkPermissions, getCurrentPosition, requestPermissions } from '@tauri-apps/plugin-geolocation';
import { formatDegreeMinute } from './sky-chart-math.js';
import { ObserverLocation, SkyChart, SkyChartService } from './sky-chart.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly chart = signal<SkyChart | null>(null);
  readonly loading = signal(true);
  readonly locating = signal(true);
  readonly error = signal<string | null>(null);
  readonly latitudeInput = signal('');
  readonly longitudeInput = signal('');
  readonly editingLocation = signal(false);
  private readonly sky = inject(SkyChartService);
  readonly signs = this.sky.signs;

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private location: ObserverLocation | null = null;
  private locationRequestId = 0;

  ngOnInit(): void {
    void this.requestDeviceLocation();
    this.refreshTimer = setInterval(() => {
      if (this.location) this.recalculate();
    }, 30_000);
  }

  ngOnDestroy(): void {
    this.locationRequestId++;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  refreshChart(): void {
    if (this.location?.source === 'device') {
      void this.requestDeviceLocation();
    } else {
      this.recalculate();
    }
  }

  async requestDeviceLocation(): Promise<void> {
    const requestId = ++this.locationRequestId;
    const hasExistingChart = this.chart() !== null;
    this.error.set(null);
    this.locating.set(!hasExistingChart);
    this.loading.set(!hasExistingChart);

    try {
      let permissions = await checkPermissions();
      if (
        permissions.location === 'prompt' ||
        permissions.location === 'prompt-with-rationale'
      ) {
        permissions = await requestPermissions(['location']);
      }

      if (requestId !== this.locationRequestId) return;

      if (permissions.location !== 'granted') {
        this.locating.set(false);
        this.loading.set(false);
        this.error.set(
          'Permesso di posizione negato. Puoi autorizzarlo oppure inserire le coordinate manualmente.'
        );
        return;
      }

      const position = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 60_000
      });

      if (requestId !== this.locationRequestId) return;

      this.location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: 'device'
      };
      this.latitudeInput.set(position.coords.latitude.toFixed(5));
      this.longitudeInput.set(position.coords.longitude.toFixed(5));
      this.locating.set(false);
      this.recalculate();
    } catch {
      if (requestId !== this.locationRequestId) return;
      this.locating.set(false);
      this.loading.set(false);
      this.error.set(
        'Non riesco a ottenere la posizione. Verifica i permessi GPS oppure inserisci le coordinate.'
      );
    }
  }

  toggleLocationEditor(): void {
    this.editingLocation.update(value => !value);
  }

  useManualLocation(): void {
    const latitude = Number(this.latitudeInput());
    const longitude = Number(this.longitudeInput());

    if (
      !this.latitudeInput().trim() ||
      !this.longitudeInput().trim() ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      this.error.set(
        'Inserisci una latitudine tra −90 e 90 e una longitudine tra −180 e 180.'
      );
      return;
    }

    this.locationRequestId++;
    this.location = { latitude, longitude, source: 'manual' };
    this.error.set(null);
    this.editingLocation.set(false);
    this.recalculate();
  }

  onLatitudeChange(value: string): void {
    this.latitudeInput.set(value);
  }

  onLongitudeChange(value: string): void {
    this.longitudeInput.set(value);
  }

  private recalculate(): void {
    if (!this.location) return;

    const initialCalculation = this.chart() === null;
    if (initialCalculation) this.loading.set(true);

    try {
      this.chart.set(this.sky.calculate(new Date(), this.location));
      this.error.set(null);
    } catch {
      this.chart.set(null);
      this.error.set('Il calcolo del cielo non è riuscito. Riprova tra qualche istante.');
    } finally {
      this.loading.set(false);
    }
  }

  formatLongitude(value: number): string {
    return formatDegreeMinute(value);
  }

  formatClock(value: Date): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    }).format(value);
  }

  formatCoordinates(location: ObserverLocation): string {
    const latitude =
      Math.abs(location.latitude).toFixed(3) + '° ' +
      (location.latitude >= 0 ? 'N' : 'S');
    const longitude =
      Math.abs(location.longitude).toFixed(3) + '° ' +
      (location.longitude >= 0 ? 'E' : 'W');

    return latitude + ' · ' + longitude;
  }
}
