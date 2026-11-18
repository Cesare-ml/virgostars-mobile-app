import { Component, OnInit, computed, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { loadPlaces, searchPlaces, type Place } from './astro/place-search';
import { chartInspectorRows, ZODIAC_NAMES } from './astro/chart-inspector';
import { nextPlanetSelection } from './astro/planet-selection';
import { civilTimeToUtc } from './astro/civil-time';
import { ChartWheelComponent } from './astro/chart-wheel.component';
import { calculateChart } from './native/chart-calculation';
import type { ChartCalculationResult, HouseSystemId } from './native/chart-calculation-contract';
import {importLocalPack, packServiceAvailable, readNativePacks, removePack, verifyPack, type PackInventory} from './native/de441-packs';

type Tab = 'home' | 'chart' | 'archive' | 'settings';
type Locale = 'it' | 'en';
type RuntimeInfo = { platform: string; mode: string; schema_version: number };

const messages = {
  it: {
    tagline: 'Il cielo, a portata di mano',
    status: 'Prototipo Android',
    welcome: 'Benvenuto in VirgoStars',
    intro: 'Il tuo futuro spazio astrologico personale, progettato per funzionare anche offline.',
    explore: 'Esplora il laboratorio',
    offlineTitle: 'Pensato per l’offline',
    offlineBody: 'Archivio crittografato, calcoli e sincronizzazione sicura sono in sviluppo.',
    chartTitle: 'Tema astrologico',
    chartIntro: 'Spazio riservato al motore grafico condiviso con VirgoStars Desktop.',
    demoWarning: 'Calcolo sperimentale: verifica la fonte e i limiti.',
    archiveTitle: 'Il mio archivio',
    archiveBody: 'I profili e le carte salvate arriveranno dopo la definizione di autenticazione e cifratura.',
    settingsTitle: 'Impostazioni',
    language: 'Lingua',
    runtime: 'Ambiente',
    data: 'Dati personali',
    dataBody: 'Data e coordinate restano nella sessione locale e non vengono salvate o trasmesse.',
    about: 'Progetto sperimentale, non ancora connesso ai servizi VirgoStars.',
    home: 'Home',
    chart: 'Carta',
    archive: 'Archivio',
    settings: 'Opzioni',
    native: 'Host nativo',
    connected: 'Connesso al bridge locale',
    browser: 'Anteprima browser',
    build: 'Interfaccia di sviluppo',
    packTitle: 'Effemeridi DE441',
    packIntro: 'Pacchetti locali per intervalli storici. Non sono ancora collegati al calcolo del tema.',
    packImport: 'Importa file locale',
    packVerify: 'Verifica SHA-256',
    packRemove: 'Rimuovi',
    packMissing: 'Non installato',
    packPresent: 'Presente, da verificare',
    packVerified: 'Hash verificato',
    packInvalid: 'File da sostituire',
    packUnavailable: 'Importazione disponibile nell’app nativa Android/iOS, non nel browser.',
    packBlocked: 'Download automatico non attivo: diritti di distribuzione e verifica scientifica indipendente in revisione.',
    packCore: 'Base',
    packOptional: 'Facoltativo',
    packFailure: 'Operazione non riuscita. Verifica che il file corrisponda al pacchetto e riprova.',
    packRemoveConfirm: 'Eliminare il pacchetto dalla memoria locale dell’app?',
    packSizeMismatch: 'Dimensione del file non corrispondente al catalogo.',
    packCancel: 'Annulla importazione',
    packCancelling: 'Annullamento…',
    packCancelled: 'Importazione annullata. Nessun pacchetto parziale installato.',
    packVerifying: 'Verifica finale SHA-256 in corso…'
  },
  en: {
    tagline: 'The sky, in your hands',
    status: 'Android prototype',
    welcome: 'Welcome to VirgoStars',
    intro: 'Your future personal astrology workspace, designed to work offline.',
    explore: 'Explore the prototype',
    offlineTitle: 'Designed for offline',
    offlineBody: 'Encrypted library, calculations and safe synchronization are under development.',
    chartTitle: 'Astrological chart',
    chartIntro: 'Reserved for the chart renderer shared with VirgoStars Desktop.',
    demoWarning: 'Experimental calculation: check the source and its limitations.',
    archiveTitle: 'My library',
    archiveBody: 'Profiles and saved charts will follow reviewed authentication and encryption.',
    settingsTitle: 'Settings',
    language: 'Language',
    runtime: 'Environment',
    data: 'Personal data',
    dataBody: 'Date and coordinates remain in the local session and are not stored or transmitted.',
    about: 'Experimental project, not connected to VirgoStars services yet.',
    home: 'Home',
    chart: 'Chart',
    archive: 'Library',
    settings: 'Settings',
    native: 'Native host',
    connected: 'Local bridge connected',
    browser: 'Browser preview',
    build: 'Development shell',
    packTitle: 'DE441 ephemerides',
    packIntro: 'Local historical-range packages. They are not connected to chart calculation yet.',
    packImport: 'Import local file',
    packVerify: 'Verify SHA-256',
    packRemove: 'Remove',
    packMissing: 'Not installed',
    packPresent: 'Present, not verified',
    packVerified: 'Hash verified',
    packInvalid: 'File must be replaced',
    packUnavailable: 'Import is available in the native Android/iOS app, not in the browser.',
    packBlocked: 'Automatic downloads disabled: redistribution rights and independent scientific validation are pending.',
    packCore: 'Base',
    packOptional: 'Optional',
    packFailure: 'Operation failed. Check the selected file and try again.',
    packRemoveConfirm: 'Delete this package from the app’s local storage?',
    packSizeMismatch: 'File size does not match the catalog.',
    packCancel: 'Cancel import',
    packCancelling: 'Cancelling…',
    packCancelled: 'Import cancelled. No partial package was installed.',
    packVerifying: 'Final SHA-256 verification in progress…'
  }
} as const;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ChartWheelComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  readonly placeQuery = signal('');
  readonly placeResults = signal<readonly Place[]>([]);
  readonly placeError = signal(false);
  readonly placeState = signal<'idle' | 'loading' | 'ready'>('idle');
  private placeTicket = 0;
  private placeTimer: ReturnType<typeof setTimeout> | undefined;
  readonly zodiacNames = ZODIAC_NAMES;
  readonly selectedHouse = signal<HouseSystemId | null>(null);
  readonly selectedPlanet = signal<string | null>(null);
  readonly inspectorRows = computed(() => {
    const result = this.chartResult();
    return result?.kind === 'ready' ? chartInspectorRows(result.chart, this.selectedHouse()) : [];
  });
  readonly chartUtc = signal('');
  readonly chartResult = signal<ChartCalculationResult | null>(null);
  readonly calculating = signal(false);
  utc = '2000-01-01T12:00';
  timezone = 'UTC';
  occurrence: '' | 'earlier' | 'later' = '';
  readonly timeError = signal('');
  latitude = '';
  longitude = '';

  searchPlace(value: string): void {
    this.placeQuery.set(value);
    this.placeResults.set([]);
    this.placeError.set(false);
    this.placeState.set('idle');
    const ticket = ++this.placeTicket;
    clearTimeout(this.placeTimer);
    if (value.trim().length < 2 || value.trim().length > 80) return;
    this.placeState.set('loading');
    this.placeTimer = setTimeout(async () => {
      try {
        const results = searchPlaces(await loadPlaces(), value);
        if (ticket === this.placeTicket) { this.placeResults.set(results); this.placeState.set('ready'); }
      } catch { if (ticket === this.placeTicket) { this.placeError.set(true); this.placeState.set('idle'); } }
    }, 200);
  }

  choosePlace(place: Place): void {
    ++this.placeTicket;
    clearTimeout(this.placeTimer);
    this.latitude = String(place.latitude);
    this.longitude = String(place.longitude);
    this.timezone = place.zone;
    this.occurrence = '';
    this.placeQuery.set(place.name + ', ' + place.country);
    this.placeResults.set([]);
    this.placeState.set('idle');
    this.timeError.set('');
    this.chartResult.set(null);
    this.selectedPlanet.set(null);
  }
  selectPlanet(id: string): void {
    const result = this.chartResult();
    if (result?.kind !== 'ready') return;
    this.selectedPlanet.set(nextPlanetSelection(result.chart.bodies, this.selectedPlanet(), id));
  }
  async calculate(): Promise<void> {
    if (this.calculating()) return;
    const lat = Number(this.latitude), lng = Number(this.longitude);
    if (!this.latitude.trim() || !this.longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(this.utc)) {
      this.chartResult.set({kind: 'invalid_request'});
      return;
    }
    const resolved = civilTimeToUtc(this.utc, this.timezone.trim(), this.occurrence);
    if (resolved.kind !== 'ready') { this.timeError.set(resolved.kind); this.chartResult.set(null); return; }
    this.timeError.set('');
    this.calculating.set(true);
    this.chartResult.set(null);
    try {
      const utcIso = resolved.utcIso;
      const result = await calculateChart({utcIso, latMicro: Math.round(lat * 1e6), lngMicro: Math.round(lng * 1e6)});
      this.chartUtc.set(utcIso);
      this.selectedPlanet.set(null);
      this.selectedHouse.set(result.kind === 'ready' ? result.chart.houses[0]?.id ?? null : null);
      this.chartResult.set(result);
    } finally { this.calculating.set(false); }
  }
  readonly tab = signal<Tab>('home');
  readonly locale = signal<Locale>('it');
  readonly runtime = signal<string | null>(null);
  readonly navTabs: readonly Tab[] = ['home', 'chart', 'archive', 'settings'];
  readonly packInventory = signal<readonly PackInventory[]>([]);
  readonly packsLoading = signal(false);
  readonly packBusy = signal<string | null>(null);
  readonly packImporting = signal(false);
  readonly packProgress = signal(0);
  readonly packError = signal('');
  readonly packNotice = signal('');
  readonly packCancelRequested = signal(false);
  readonly packChecked = signal<Readonly<Record<string, string>>>({});
  readonly nativePacks = packServiceAvailable();
  private packAbort: AbortController | null = null;

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  navigate(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'settings') void this.refreshPacks();
  }

  private async refreshPacks(): Promise<void> {
    this.packsLoading.set(true);
    this.packError.set('');
    try {
      if (this.nativePacks) {
        this.packInventory.set(await readNativePacks());
      } else {
        // The catalog has no download addresses or binary files: browser preview only.
        const response = await fetch('assets/de441-pack-catalog.json');
        if (!response.ok) throw new Error('catalog_unavailable');
        const catalog = await response.json() as {packs: Omit<PackInventory, 'status'>[]};
        if (!Array.isArray(catalog.packs) || catalog.packs.length !== 10) throw new Error('catalog_invalid');
        this.packInventory.set(catalog.packs.map(pack => ({...pack, status: 'missing' as const})));
      }
    } catch {
      this.packError.set(this.t('packFailure'));
    } finally {
      this.packsLoading.set(false);
    }
  }

  packLabel(pack: PackInventory): string {
    const checked = this.packChecked()[pack.id];
    if (checked === 'verified') return this.t('packVerified');
    if (checked === 'invalid_hash' || checked === 'invalid_size' || pack.status === 'invalid_size') return this.t('packInvalid');
    return pack.status === 'missing' ? this.t('packMissing') : this.t('packPresent');
  }

  async importPackFile(id: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const pack = this.packInventory().find(item => item.id === id);
    if (!pack || !file || !this.nativePacks || this.packBusy()) return;
    if (file.size !== pack.bytes) {
      this.packError.set(this.t('packSizeMismatch'));
      return;
    }
    this.packError.set('');
    this.packNotice.set('');
    this.packBusy.set(id);
    this.packImporting.set(true);
    this.packProgress.set(0);
    this.packCancelRequested.set(false);
    const controller = new AbortController();
    this.packAbort = controller;
    try {
      await importLocalPack(pack, file, value => this.packProgress.set(Math.round(value * 100)), controller.signal);
      this.packChecked.update(map => ({...map, [id]: 'verified'}));
      await this.refreshPacks();
    } catch {
      if (controller.signal.aborted) this.packNotice.set(this.t('packCancelled'));
      else this.packError.set(this.t('packFailure'));
    } finally {
      this.packAbort = null;
      this.packCancelRequested.set(false);
      this.packImporting.set(false);
      this.packBusy.set(null);
    }
  }

  cancelPackImport(): void {
    if (!this.packBusy() || this.packProgress() >= 100 || !this.packAbort) return;
    this.packCancelRequested.set(true);
    this.packAbort.abort();
  }

  async checkPack(id: string): Promise<void> {
    if (!this.nativePacks || this.packBusy()) return;
    this.packError.set('');
    this.packBusy.set(id);
    try {
      const result = await verifyPack(id);
      this.packChecked.update(map => ({...map, [id]: result.status}));
    } catch {
      this.packError.set(this.t('packFailure'));
    } finally {
      this.packBusy.set(null);
    }
  }

  async deletePack(id: string): Promise<void> {
    if (!this.nativePacks || this.packBusy() || !window.confirm(this.t('packRemoveConfirm'))) return;
    this.packError.set('');
    this.packBusy.set(id);
    try {
      await removePack(id);
      this.packChecked.update(map => {
        const next = {...map};
        delete next[id];
        return next;
      });
      await this.refreshPacks();
    } catch {
      this.packError.set(this.t('packFailure'));
    } finally {
      this.packBusy.set(null);
    }
  }

  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }

  ngOnInit(): void {
    invoke<RuntimeInfo>('runtime_info')
      .then(info => {
        if (info.schema_version === 1 && info.mode === 'prototype') {
          this.runtime.set(info.platform);
        }
      })
      .catch(() => this.runtime.set(null)); // Expected in the browser.
  }
}
