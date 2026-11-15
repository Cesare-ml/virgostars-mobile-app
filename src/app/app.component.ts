import { Component, OnInit, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { captureMoment, type MomentCaptureRecord } from './moment/moment-capture';
import { getMomentPosition, notifyMomentCaptured } from './moment/native-capabilities';

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
    build: 'Interfaccia di sviluppo',
    captureTitle: 'Cattura il momento',
    captureBody: 'Acquisisce l’ora del comando e una posizione GPS con il tuo consenso. Per ora le bozze restano solo in questa sessione.',
    captureEnable: 'Abilita cattura (solo questa sessione)',
    captureNotifications: 'Abilita notifica di conferma',
    captureAction: 'Cattura adesso',
    captureWorking: 'Acquisizione posizione…',
    captureSuccess: 'Momento acquisito: bozza temporanea, non salvata sul dispositivo.',
    capturePermission: 'Posizione non autorizzata. Attiva il permesso nelle impostazioni del dispositivo.',
    captureFailed: 'Acquisizione non riuscita. Controlla la posizione, la precisione e l’app nativa.',
    captureEnableHint: 'Attiva la funzione dalle impostazioni per iniziare.',
    archiveTemporary: 'Bozze della sessione (scompaiono chiudendo l’app)',
    archivePosition: 'Coordinate GPS',
    archiveAccuracy: 'Precisione stimata',
    archivePending: 'Tema non calcolato',
    archiveEmpty: 'Non ci sono momenti acquisiti in questa sessione.',
    privacyNote: 'Nessun dato viene ancora archiviato in modo permanente, sincronizzato o inviato al server.'
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
    build: 'Development shell',
    captureTitle: 'Capture the moment',
    captureBody: 'Records the instant you tap and requests a one-shot GPS fix with your permission. Drafts only last for this session.',
    captureEnable: 'Enable capture (this session only)',
    captureNotifications: 'Enable confirmation notification',
    captureAction: 'Capture now',
    captureWorking: 'Acquiring location…',
    captureSuccess: 'Moment captured: temporary draft, not saved on the device.',
    capturePermission: 'Location not authorized. Enable permission in system settings.',
    captureFailed: 'Capture failed. Check location, accuracy and the native app.',
    captureEnableHint: 'Enable the feature in Settings first.',
    archiveTemporary: 'Session drafts (lost when you close the app)',
    archivePosition: 'GPS coordinates',
    archiveAccuracy: 'Estimated accuracy',
    archivePending: 'Chart not calculated',
    archiveEmpty: 'No moments captured in this session.',
    privacyNote: 'Nothing is permanently archived, synchronized or sent to a server yet.'
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
  readonly navTabs: readonly Tab[] = ['home', 'chart', 'archive', 'settings'];
  readonly captureEnabled = signal(false);
  readonly notificationsEnabled = signal(false);
  readonly isCapturing = signal(false);
  readonly captureState = signal<'none' | 'success' | 'permission' | 'failure'>('none');
  readonly moments = signal<readonly MomentCaptureRecord[]>([]);

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  navigate(tab: Tab): void {
    this.tab.set(tab);
  }

  switchLocale(): void {
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
  }

  toggleCapture(): void {
    this.captureEnabled.update((value) => !value);
    this.captureState.set('none');
  }

  async captureNow(): Promise<void> {
    if (!this.captureEnabled() || this.isCapturing()) return;
    this.isCapturing.set(true);
    this.captureState.set('none');
    try {
      const captured = await captureMoment(getMomentPosition);
      if (!this.captureEnabled()) return; // Opt-out during the GPS request.
      // Deliberately *in-memory only* until encrypted, profile-scoped storage exists.
      this.moments.update((items) => [captured, ...items].slice(0, 50));
      this.captureState.set('success');
      if (this.notificationsEnabled()) {
        try { await notifyMomentCaptured(); } catch { /* Optional: capture still succeeded. */ }
      }
    } catch (error: unknown) {
      this.captureState.set(
        error instanceof Error && error.message === 'location-permission-denied'
          ? 'permission' : 'failure'
      );
    } finally {
      this.isCapturing.set(false);
    }
  }

  momentLocalTime(moment: MomentCaptureRecord): string {
    return new Date(moment.capturedAtUtc).toLocaleString(
      this.locale() === 'it' ? 'it-IT' : 'en-GB',
      { timeZone: moment.timezoneId, dateStyle: 'medium', timeStyle: 'medium' }
    );
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
