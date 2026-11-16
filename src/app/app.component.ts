import { Component, OnInit, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { validateChartRequestV1, type ChartRequestV1 } from './chart-request';

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
    inputTitle: 'Prepara una richiesta di carta',
    inputHint: 'Dati temporanei: non vengono salvati o inviati. Indica il fuso UTC esplicitamente.',
    dateLabel: 'Data locale', timeLabel: 'Ora locale', offsetLabel: 'Scostamento UTC (minuti)',
    latitudeLabel: 'Latitudine', longitudeLabel: 'Longitudine', validateLabel: 'Verifica dati',
    validLabel: 'Richiesta valida, pronta per una futura integrazione del motore. Nessun calcolo eseguito.',
    invalidLabel: 'Correggi i campi indicati:',
    demoWarning: 'Illustrazione geometrica: non rappresenta posizioni astrali calcolate.',
    archiveTitle: 'Il mio archivio',
    archiveBody: 'I profili e le carte salvate arriveranno dopo la definizione di autenticazione e cifratura.',
    settingsTitle: 'Impostazioni',
    language: 'Lingua',
    runtime: 'Ambiente',
    data: 'Dati personali',
    dataBody: 'Nessun dato di nascita viene richiesto, memorizzato o trasmesso in questa versione.',
    about: 'Progetto sperimentale, non ancora connesso ai servizi VirgoStars.',
    home: 'Home',
    chart: 'Carta',
    archive: 'Archivio',
    settings: 'Opzioni',
    native: 'Host nativo',
    connected: 'Connesso al bridge locale',
    browser: 'Anteprima browser',
    build: 'Interfaccia di sviluppo'
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
    inputTitle: 'Prepare a chart request',
    inputHint: 'Temporary values: not saved or transmitted. Specify the UTC offset explicitly.',
    dateLabel: 'Local date', timeLabel: 'Local time', offsetLabel: 'UTC offset (minutes)',
    latitudeLabel: 'Latitude', longitudeLabel: 'Longitude', validateLabel: 'Validate inputs',
    validLabel: 'Valid request, ready for a future engine integration. No calculation performed.',
    invalidLabel: 'Correct these fields:',
    demoWarning: 'Geometric illustration: no calculated planetary positions are shown.',
    archiveTitle: 'My library',
    archiveBody: 'Profiles and saved charts will follow reviewed authentication and encryption.',
    settingsTitle: 'Settings',
    language: 'Language',
    runtime: 'Environment',
    data: 'Personal data',
    dataBody: 'No birth records are requested, stored or transmitted in this version.',
    about: 'Experimental project, not connected to VirgoStars services yet.',
    home: 'Home',
    chart: 'Chart',
    archive: 'Library',
    settings: 'Settings',
    native: 'Native host',
    connected: 'Local bridge connected',
    browser: 'Browser preview',
    build: 'Development shell'
  }
} as const;

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  readonly tab = signal<Tab>('home');
  readonly locale = signal<Locale>('it');
  readonly runtime = signal<string | null>(null);
  readonly chartFields = signal({ localDate: '', localTime: '', utcOffsetMinutes: '', latitude: '', longitude: '' });
  readonly chartValidation = signal<{ ok: boolean; errors: readonly string[] } | null>(null);
  readonly navTabs: readonly Tab[] = ['home', 'chart', 'archive', 'settings'];

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  updateChartField(field: keyof ReturnType<typeof this.chartFields>, value: string): void {
    this.chartFields.update(current => ({ ...current, [field]: value }));
    this.chartValidation.set(null);
  }

  validateChart(): void {
    const fields = this.chartFields();
    const request: ChartRequestV1 = {
      schemaVersion: 1,
      localDate: fields.localDate,
      localTime: fields.localTime.length === 5 ? fields.localTime + ':00' : fields.localTime,
      utcOffsetMinutes: fields.utcOffsetMinutes.trim() === '' ? NaN : Number(fields.utcOffsetMinutes),
      latitude: fields.latitude.trim() === '' ? NaN : Number(fields.latitude),
      longitude: fields.longitude.trim() === '' ? NaN : Number(fields.longitude)
    };
    const result = validateChartRequestV1(request);
    this.chartValidation.set(result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors });
  }

  navigate(tab: Tab): void {
    this.tab.set(tab);
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
