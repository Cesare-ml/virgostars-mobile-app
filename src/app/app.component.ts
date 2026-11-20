import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { countryLabel, placeLabel, type Place } from './astro/place-search';
import {searchPlaceCatalog} from './astro/place-search-client';
import { chartInspectorAxes, chartInspectorRows, formatDegreeInSign as formatPosition, ZODIAC_NAMES } from './astro/chart-inspector';
import { pointLabel } from './astro/point-labels';
import { nextPlanetSelection } from './astro/planet-selection';
import { civilTimeToUtc, instantToCivil, instantToCivilExact, planRelocation, skyStepTarget, type CivilTime, type RelocationMode, type RelocationResult, type SkyStep } from './astro/civil-time';
import { ChartWheelComponent, type ChartMode, type OverlayChart } from './astro/chart-wheel.component';
import { ChartSettingsComponent, aspectLabel, aspectSymbol } from './chart-settings.component';
import {ASPECT_DEFINITIONS, defaultChartSettings, sanitizeChartSettings, type ChartSettings} from './chart-settings';
import {buildTemaRenderData, dodecatemoriaRows, formatDegreeInSign} from './astro/tema-render-data';
import {aspectTable} from './astro/aspect-table';
import {deviceLocale,type UiTheme} from './ui-preferences';
import { calculateChart } from './native/chart-calculation';
import type { ChartCalculationResult, HouseSystemId } from './native/chart-calculation-contract';
import {ephemerisStatus, importEphemeris, usnoSelection, type EphemerisStatus, type ImportResult} from './native/ephemeris-import';
import {archiveOperation} from './native/chart-archive';
import {newChartId, type ArchiveResult, type SavedChartV1} from './native/chart-archive-contract';
import {filterArchive} from './archive-search';
import {DEFAULT_STARTUP, type StartupPreference} from './startup-preference';
import {readStartup, writeStartup} from './native/startup-preference';
import {readDeviceUi, readDeviceChart, writeDeviceUi, writeDeviceChart} from './native/device-preferences';
import {chartElements} from './astro/elements';
import {chartHeaderTime} from './astro/chart-header';
import {pointGlyph,zodiacGlyph} from './astro/glyph-paths';
import {SETTINGS_ENTRIES,filterSettings,type SettingsPage} from './settings-menu';

type Tab = 'chart' | 'new-chart' | 'archive' | 'settings';
type ChartPanel = 'chart' | 'latitude' | 'planets' | 'aspects' | 'elements' | 'tools';
type Locale = 'it' | 'en';
type RuntimeInfo = { platform: string; mode: string; schema_version: number };
type ChartPlace = {zone: string; latitude: string; longitude: string; label: string};
type SessionChart = {id: number; name: string; utcIso: string; place: ChartPlace; result: Extract<ChartCalculationResult, {kind: 'ready'}>; house: HouseSystemId | null};
type NavigationBase = {utcIso: string; place: ChartPlace; result: Extract<ChartCalculationResult, {kind: 'ready'}>};
type PendingSkyStep = {kind: 'ambiguous' | 'nonexistent'; civil: string; baseUtc: string; zone: string};
type FormBackup = {name:string;utc:string;timezone:string;occurrence:''|'earlier'|'later';latitude:string;longitude:string;query:string;place:Place|null};

const messages = {
  it: {
    chartTitle: 'Tema astrologico',
    archiveTitle: 'Il mio archivio',
    settingsTitle: 'Impostazioni',
    language: 'Lingua',
    home: 'Home',
    chart: 'Carta',
    archive: 'Archivio',
    settings: 'Opzioni'
  },
  en: {
    chartTitle: 'Astrological chart',
    archiveTitle: 'My library',
    settingsTitle: 'Settings',
    language: 'Language',
    home: 'Home',
    chart: 'Chart',
    archive: 'Library',
    settings: 'Settings'
  }
} as const;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ChartWheelComponent, ChartSettingsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly archiveState=signal<ArchiveResult | null>(null);
  readonly archiveBusy=signal(false);
  readonly pendingArchiveDelete=signal<string | null>(null);
  readonly archiveNotice=signal<'saved'|'opened'|''>('');
  readonly archiveChartError=signal(false);
  readonly activeArchiveId=signal<string | null>(null);
  readonly archiveQuery=signal('');
  readonly visibleArchive=computed(()=>{const state=this.archiveState();return state?.kind==='ready' ? filterArchive(state.charts,this.archiveQuery()) : [];});
  readonly pendingArchiveUpdate=signal(false);
  readonly startup=signal<StartupPreference>(DEFAULT_STARTUP);
  readonly startupBusy=signal(false);
  readonly startupSaving=signal(false);
  readonly startupStorageError=signal(false);
  private startupGeneration=0;
  private startupWriteVersion=0;
  private startupWriteQueue:Promise<boolean>=Promise.resolve(true);
  chartInputName='';
  private lastFailedAutosave:{signature:string; id:string}|null=null;
  readonly archivedOverlayId=signal('');
  readonly electiveOpen=signal(false);
  electiveName='';
  archiveMessage(kind:ArchiveResult['kind']):string {
    const it=this.locale()==='it';
    switch(kind) {
      case 'archive_locked': return it ? 'Impossibile aprire l’archivio su questo dispositivo.' : 'Unable to open the archive on this device.';
      case 'archive_corrupt': return it ? 'Archivio danneggiato; i dati non sono stati modificati.' : 'Archive damaged; the data was left unchanged.';
      case 'archive_newer': return it ? 'Archivio creato da una versione più recente.' : 'Archive was created by a newer version.';
      case 'archive_full': return it ? 'Archivio pieno.' : 'Archive is full.';
      case 'invalid_request': return it ? 'Dati del tema non validi per il salvataggio.' : 'Chart data is invalid for saving.';
      case 'not_found': return it ? 'Tema non trovato nell’archivio.' : 'Chart not found in the archive.';
      case 'not_native': return it ? 'Archivio disponibile solo nell’app Android.' : 'Archive is available only in the Android app.';
      case 'archive_unavailable': case 'unavailable': return it ? 'Archivio non disponibile su questo dispositivo.' : 'Archive is unavailable on this device.';
      default:return '';
    }
  }
  async refreshArchive():Promise<void> {
    if(this.archiveBusy()) return;
    this.archiveBusy.set(true);
    try { this.archiveState.set(await archiveOperation({operation:'list'})); }
    finally { this.archiveBusy.set(false); }
  }
  async saveArchivedChart():Promise<void> {
    this.pauseLiveSky();
    const result=this.chartResult(), place=this.chartPlace, utcIso=this.chartUtc();
    if(this.archiveBusy() || this.calculating() || this.overlayBusy() || result?.kind!=='ready' || !place) return;
    let id=this.activeArchiveId();
    try { id ??= newChartId(); } catch { this.archiveState.set({kind:'unavailable'}); return; }
    const state=this.archiveState();
    const previousName=state?.kind==='ready' ? state.charts.find(chart=>chart.id===id)?.name : undefined;
    const name=Array.from(this.sessionName.trim()).slice(0,80).join('') || previousName || (this.locale()==='it' ? 'Tema senza nome' : 'Untitled chart');
    this.archiveBusy.set(true); this.archiveNotice.set('');
    try {
      const response=await archiveOperation({operation:'save',chart:{id,name,utcIso,timeZone:place.zone,
        latMicro:Math.round(Number(place.latitude)*1e6),lngMicro:Math.round(Number(place.longitude)*1e6),placeName:place.label}});
      this.archiveState.set(response);
      if(response.kind==='ready') { this.archiveNotice.set('saved');
        if(this.chartResult()===result && this.chartPlace===place && this.chartUtc()===utcIso) {
          this.activeArchiveId.set(id);this.sessionName=name;this.navigationBase.set({utcIso,place:{...place},result});
        }
      }
    } finally { this.archiveBusy.set(false); }
  }
  requestArchiveSave():void {
    if(this.activeArchiveId()) this.pendingArchiveUpdate.set(true);
    else void this.saveArchivedChart();
  }
  async confirmArchiveUpdate():Promise<void> {this.pendingArchiveUpdate.set(false);await this.saveArchivedChart();}
  openElective():void {
    if(this.calculating() || this.overlayBusy() || !this.chartPlace || this.chartResult()?.kind!=='ready') return;
    this.pauseLiveSky();
    this.electiveName=`${this.locale()==='it' ? 'Elettiva' : 'Election'} ${this.utc.replace('T',' ')}`;
    this.electiveOpen.set(true);
  }
  async saveElective():Promise<void> {
    const place=this.chartPlace, result=this.chartResult(), name=this.electiveName.trim();
    if(!name || this.archiveBusy() || this.calculating() || this.overlayBusy() || !place || result?.kind!=='ready') return;
    let id:string;try {id=newChartId();} catch {this.archiveState.set({kind:'unavailable'});return;}
    this.archiveBusy.set(true);
    try {
      const response=await archiveOperation({operation:'save',chart:{id,name,utcIso:this.chartUtc(),timeZone:place.zone,
        latMicro:Math.round(Number(place.latitude)*1e6),lngMicro:Math.round(Number(place.longitude)*1e6),placeName:place.label}});
      this.archiveState.set(response);
      if(response.kind==='ready') {this.electiveOpen.set(false);this.archiveNotice.set('saved');}
    } finally {this.archiveBusy.set(false);}
  }
  async openArchivedChart(chart:SavedChartV1):Promise<void> {
    if(this.archiveBusy() || this.calculating() || this.overlayBusy()) return;
    const local=instantToCivilExact(Date.parse(chart.utcIso),chart.timeZone);
    if(!local) {this.archiveState.set({kind:'invalid_request'});return;}
    const generation=this.startupGeneration;
    this.archiveBusy.set(true); this.calculating.set(true); this.pauseLiveSky(); this.archiveNotice.set(''); this.archiveChartError.set(false);
    try {
      const result=await calculateChart({utcIso:chart.utcIso,latMicro:chart.latMicro,lngMicro:chart.lngMicro});
      if(this.destroyed || generation!==this.startupGeneration) return;
      if(result.kind!=='ready') {this.archiveChartError.set(true);return;}
      this.calculating.set(false);
      this.restoreSessionChart({id:0,name:chart.name,utcIso:chart.utcIso,
        place:{zone:chart.timeZone,latitude:String(chart.latMicro/1e6),longitude:String(chart.lngMicro/1e6),label:chart.placeName},result,house:null});
      this.activeArchiveId.set(chart.id); this.sessionName=chart.name;
      this.archiveNotice.set('opened');
    } finally {this.calculating.set(false);this.archiveBusy.set(false);}
  }
  async deleteArchivedChart(id:string):Promise<void> {
    if(this.archiveBusy() || this.pendingArchiveDelete()!==id) return;
    this.archiveBusy.set(true);this.archiveNotice.set('');
    try {const response=await archiveOperation({operation:'delete',id});this.archiveState.set(response);if(response.kind==='ready') {
      if(this.activeArchiveId()===id) this.activeArchiveId.set(null);
      if(this.startup().chartId===id) this.setStartup('sky',null);
      if(this.archivedOverlayId()===id) {this.archivedOverlayId.set('');this.overlay.set(null);}
    }this.pendingArchiveDelete.set(null);}
    finally {this.archiveBusy.set(false);}
  }
  readonly ephemeris = signal<EphemerisStatus | null>(null);
  readonly ephemerisBusy = signal(false);
  readonly ephemerisProgress = signal(0);
  readonly ephemerisResult = signal<ImportResult | ''>('');
  private ephemerisAbort?: AbortController;
  coverageDate(julianDay:number):string {
    const date = new Date((julianDay - 2_440_587.5) * 86_400_000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '—';
  }
  async refreshEphemeris():Promise<void> { this.ephemeris.set(await ephemerisStatus()); }
  async selectEphemeris(event:Event, kind:'de441'|'usno'|'chiron' = 'de441'):Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length || this.ephemerisBusy()) return;
    const usno=kind === 'usno' ? usnoSelection(files) : null;
    if (kind === 'usno' && !usno) { this.ephemerisResult.set('missing_usno_files'); return; }
    const file=usno?.blob ?? files[0];
    this.ephemerisBusy.set(true); this.ephemerisProgress.set(0); this.ephemerisResult.set('');
    const abort = new AbortController(); this.ephemerisAbort = abort;
    try {
      const spec=kind === 'usno' ? {kind:'usno' as const,parts:usno!.parts} : kind === 'chiron' ? {kind:'chiron' as const} : undefined;
      const result = await importEphemeris(file, abort.signal, n => this.ephemerisProgress.set(Math.round(n * 100)), undefined, spec);
      this.ephemerisResult.set(result);
      await this.refreshEphemeris();
    } finally { this.ephemerisAbort = undefined; this.ephemerisBusy.set(false); }
  }
  cancelEphemeris():void { this.ephemerisAbort?.abort(); }
  @ViewChild('relocationPanel') private relocationPanel?: ElementRef<HTMLDetailsElement>;
  readonly placeQuery = signal('');
  readonly placeResults = signal<readonly Place[]>([]);
  readonly placeError = signal(false);
  readonly placeState = signal<'idle' | 'loading' | 'ready'>('idle');
  private placeTicket = 0;
  private placeTimer: ReturnType<typeof setTimeout> | undefined;
  readonly zodiacNames = ZODIAC_NAMES;
  readonly pointLabel = pointLabel;
  readonly pointGlyph = pointGlyph;
  readonly zodiacGlyph = zodiacGlyph;
  readonly countryLabel = countryLabel;
  readonly aspectLabel = aspectLabel;
  readonly aspectSymbol = aspectSymbol;
  readonly formatOrb = formatDegreeInSign;
  readonly formatPosition = formatPosition;
  readonly selectedHouse = signal<HouseSystemId | null>(null);
  readonly preferredHouse = signal<HouseSystemId | null>('placido');
  readonly houseOptions:readonly {id:HouseSystemId;label:string}[]=[{id:'placido',label:'Placido'}, {id:'egizia',label:'Egizia'}, {id:'koch',label:'Koch'}, {id:'regio-montano',label:'Regiomontano'}, {id:'porfirio',label:'Porfirio'}];
  readonly preferencesReady=signal(false);
  readonly uiPreferencesError=signal(false);
  readonly chartPreferencesError=signal(false);
  readonly uiPreferencesSaving=signal(false);
  readonly chartPreferencesSaving=signal(false);
  private uiPreferenceVersion=0;
  private chartPreferenceVersion=0;
  private uiPreferenceQueue:Promise<boolean>=Promise.resolve(true);
  private chartPreferenceQueue:Promise<boolean>=Promise.resolve(true);
  readonly selectedPlanet = signal<string | null>(null);
  readonly inspectorRows = computed(() => {
    const result = this.chartResult();
    return result?.kind === 'ready' ? chartInspectorRows(result.chart, this.selectedHouse()) : [];
  });
  readonly inspectorAxes = computed(() => {
    const result = this.chartResult();
    return result?.kind === 'ready' ? chartInspectorAxes(result.chart, this.selectedHouse()) : [];
  });
  readonly chartUtc = signal('');
  readonly chartResult = signal<ChartCalculationResult | null>(null);
  readonly chartName = signal('');
  readonly chartIsSky = signal(true);
  readonly chartHeading = computed(()=>this.chartIsSky() ? (this.locale()==='it' ? 'Cielo attuale' : 'Current sky') : this.chartName() || (this.locale()==='it' ? 'Tema senza nome' : 'Untitled chart'));
  readonly chartMetadata = computed(()=>{
    this.chartResult();
    const place=this.chartPlace, time=chartHeaderTime(this.chartUtc(),place?.zone ?? '');
    const location=place ? place.label || `${place.latitude}°, ${place.longitude}°` : '';
    return [time,location].filter(Boolean).join(' · ');
  });
  readonly navigationTime = computed(()=>{this.chartResult();return chartHeaderTime(this.chartUtc(),this.chartPlace?.zone ?? '');});
  readonly elementGroups = computed(()=>{const result=this.chartResult();return result?.kind==='ready' ? chartElements(result.chart) : [];});
  readonly showDodecatemoria = signal(false);
  readonly dodecatemoria = computed(()=>{
    const result=this.chartResult();
    if(result?.kind!=='ready') return [];
    const data=buildTemaRenderData(result.chart,this.chartUtc());
    return data ? dodecatemoriaRows(data,this.selectedHouse()) : [];
  });
  readonly calculating = signal(false);
  readonly overlayBusy = signal(false);
  readonly overlayError = signal(false);
  readonly mode = signal<ChartMode>('natal');
  readonly overlay = signal<(OverlayChart & {name: string; sessionId: number | null}) | null>(null);
  readonly effectiveMode = computed(() => (this.mode() === 'transits' || this.mode() === 'synastry') && !this.overlay() ? 'natal' : this.mode());
  readonly chartSettings = signal<ChartSettings>(defaultChartSettings());
  readonly natalAspectRows = computed(() => {
    const result = this.chartResult();
    if (result?.kind !== 'ready') return [];
    const natal = buildTemaRenderData(result.chart, this.chartUtc());
    if (!natal) return [];
    return aspectTable(natal, null, this.chartSettings(), ASPECT_DEFINITIONS, 'A_TO_B', {provider:result.provider,chart:result.chart,utcIso:this.chartUtc()});
  });
  readonly comparisonAspectRows = computed(() => {
    const result = this.chartResult();
    if (result?.kind !== 'ready') return [];
    const natal = buildTemaRenderData(result.chart, this.chartUtc());
    if (!natal) return [];
    const comparison = this.overlay();
    const mode = this.effectiveMode();
    if (!comparison || (mode !== 'transits' && mode !== 'synastry')) return [];
    const other = buildTemaRenderData(comparison.chart, comparison.utcIso);
    if (!other) return [];
    return mode === 'transits'
      ? aspectTable(other, natal, this.chartSettings(), ASPECT_DEFINITIONS, 'SKY_TO_NATAL', {provider:comparison.provider,chart:comparison.chart,utcIso:comparison.utcIso}, {provider:result.provider,chart:result.chart,utcIso:this.chartUtc()})
      : aspectTable(natal, other, this.chartSettings(), ASPECT_DEFINITIONS);
  });
  readonly navigationError = signal(false);
  readonly navigationCalculationError = signal(false);
  readonly liveSky = signal(false);
  readonly liveSkyBusy = signal(false);
  readonly skyReturnError = signal(false);
  private skyPlace:ChartPlace={zone:'Europe/Rome',latitude:'41.893',longitude:'12.483',label:'Roma'};
  private liveSkyTimer: ReturnType<typeof setInterval> | undefined;
  private liveSkyGeneration = 0;
  private destroyed = false;
  private readonly onVisibilityChange = (): void => { if (document.hidden) {this.pauseLiveSky();this.stopSkyHold();} };
  readonly pendingSkyStep = signal<PendingSkyStep | null>(null);
  private readonly navigationBase = signal<NavigationBase | null>(null);
  readonly canRestoreNavigation = computed(() => {
    const base = this.navigationBase();
    const place = this.chartPlace;
    return !!base && !!place && this.chartResult()?.kind === 'ready' && (this.chartUtc() !== base.utcIso ||
      place.zone !== base.place.zone || Number(place.latitude) !== Number(base.place.latitude) || Number(place.longitude) !== Number(base.place.longitude));
  });
  skyStep: SkyStep = 'minute';
  skyAmount = 4;
  private holdTimer:ReturnType<typeof setTimeout>|undefined;
  private holdGeneration=0;
  readonly sessionCharts = signal<readonly SessionChart[]>([]);
  sessionName = '';
  private nextSessionId = 1;
  private chartPlace: ChartPlace | null = null;
  private chosenPlace: Place | null = null;
  private newChartBackup:FormBackup|null=null;
  readonly newChartError=signal('');
  relocationLatitude = '';
  relocationLongitude = '';
  relocationZone = '';
  relocationMode: RelocationMode = 'instant';
  relocationOccurrence: '' | 'earlier' | 'later' = '';
  readonly relocationError = signal<Exclude<RelocationResult['kind'], 'ready'> | ''>('');
  readonly relocationQuery = signal('');
  readonly relocationResults = signal<readonly Place[]>([]);
  readonly relocationSearchState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private relocationTicket = 0;
  private relocationTimer: ReturnType<typeof setTimeout> | undefined;
  private relocationLabel = '';
  utc = '2000-01-01T12:00';
  timezone = 'UTC';
  occurrence: '' | 'earlier' | 'later' = '';
  readonly timeError = signal('');
  latitude = '';
  longitude = '';

  searchPlace(value: string): void {
    this.pendingSkyStep.set(null);
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
        const results = await searchPlaceCatalog(value, this.locale());
        if (ticket === this.placeTicket) { this.placeResults.set(results); this.placeState.set('ready'); }
      } catch { if (ticket === this.placeTicket) { this.placeError.set(true); this.placeState.set('idle'); } }
    }, 200);
  }

  choosePlace(place: Place): void {
    this.pauseLiveSky();
    if (this.calculating() || this.overlayBusy()) return;
    ++this.placeTicket;
    clearTimeout(this.placeTimer);
    this.latitude = String(place.latitude);
    this.chosenPlace = place;
    this.longitude = String(place.longitude);
    this.timezone = place.zone;
    this.occurrence = '';
    this.placeQuery.set(placeLabel(place));
    this.placeResults.set([]);
    this.placeState.set('idle');
    this.timeError.set('');
    this.pendingSkyStep.set(null);
    if(this.tab()==='new-chart') return;
    this.closeRelocation();
    this.navigationBase.set(null);
    this.navigationCalculationError.set(false);
    this.chartResult.set(null);
    this.chartPlace = null;
    this.overlay.set(null);
    this.mode.set('natal');
    this.selectedPlanet.set(null);
  }
  selectPlanet(id: string): void {
    const result = this.chartResult();
    if (result?.kind !== 'ready') return;
    this.selectedPlanet.set(nextPlanetSelection(result.chart.bodies, this.selectedPlanet(), id));
  }
  openNewChart(copyCurrent=false):void {
    if(this.calculating() || this.overlayBusy() || this.archiveBusy()) return;
    if(this.chartIsSky() && this.chartPlace) this.skyPlace={...this.chartPlace};
    this.pauseLiveSky();++this.startupGeneration;
    this.newChartBackup={name:this.chartInputName,utc:this.utc,timezone:this.timezone,occurrence:this.occurrence,
      latitude:this.latitude,longitude:this.longitude,query:this.placeQuery(),place:this.chosenPlace};
    if(!copyCurrent) {
      this.chartInputName='';this.chosenPlace=null;this.placeQuery.set('');this.latitude='';this.longitude='';
      let zone='UTC';try {zone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';} catch { /* UTC fallback */ }
      const local=instantToCivilExact(Date.now(),zone);
      this.timezone=local ? zone : 'UTC';this.utc=local?.civil ?? instantToCivilExact(Date.now(),'UTC')!.civil;this.occurrence=local?.occurrence ?? '';
    }
    this.placeResults.set([]);this.placeState.set('idle');this.placeError.set(false);this.timeError.set('');this.newChartError.set('');
    this.archiveNotice.set('');this.tab.set('new-chart');
  }
  cancelNewChart():void {
    if(this.calculating() || this.archiveBusy()) return;
    const old=this.newChartBackup;
    if(old) {this.chartInputName=old.name;this.utc=old.utc;this.timezone=old.timezone;this.occurrence=old.occurrence;
      this.latitude=old.latitude;this.longitude=old.longitude;this.placeQuery.set(old.query);this.chosenPlace=old.place;}
    this.newChartBackup=null;this.newChartError.set('');this.timeError.set('');
    this.tab.set(this.chartResult()?.kind==='ready'?'chart':'archive');
  }
  async calculate(navigating = false, destination?: ChartPlace): Promise<void> {
    const fromNewChart=this.tab()==='new-chart';
    if (!navigating) {this.pauseLiveSky();++this.startupGeneration;}
    if (this.calculating() || this.overlayBusy() || (!navigating && this.archiveBusy())) return;
    this.pendingArchiveUpdate.set(false);
    if(!navigating) {this.archiveNotice.set('');this.electiveOpen.set(false);}
    if (!navigating && !fromNewChart) this.activeArchiveId.set(null);
    if(fromNewChart) this.newChartError.set('');
    const lat = Number(this.latitude), lng = Number(this.longitude);
    if (!this.latitude.trim() || !this.longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      if(fromNewChart) this.newChartError.set('invalid_request');
      else {if (!navigating) this.navigationBase.set(null);this.chartResult.set({kind:'invalid_request'});}
      return;
    }
    const resolved = civilTimeToUtc(this.utc, this.timezone.trim(), this.occurrence);
    if (resolved.kind !== 'ready') { if (!navigating && !fromNewChart) this.navigationBase.set(null); this.timeError.set(resolved.kind); if(!fromNewChart) this.chartResult.set(null); return; }
    const previous = navigating ? this.chartResult() : null;
    const previousPlace = navigating ? this.chartPlace : null;
    const previousUtc = this.chartUtc();
    this.timeError.set('');
    this.navigationError.set(false);
    this.navigationCalculationError.set(false);
    this.pendingSkyStep.set(null);
    this.calculating.set(true);
    if (!navigating && !fromNewChart) this.chartResult.set(null);
    try {
      const utcIso = resolved.utcIso;
      let savedId:string|null=null;
      if (fromNewChart) {
        const place=this.chosenPlace;
        const label=place && place.latitude===lat && place.longitude===lng && (!place.zone || place.zone===this.timezone.trim()) && this.placeQuery()===placeLabel(place) ? this.placeQuery() : '';
        const data={name:Array.from(this.chartInputName.trim()).slice(0,80).join(''),utcIso,timeZone:this.timezone.trim(),
          latMicro:Math.round(lat*1e6),lngMicro:Math.round(lng*1e6),placeName:label};
        const signature=JSON.stringify(data);
        let id:string|null=null;
        try {id=this.lastFailedAutosave?.signature===signature ? this.lastFailedAutosave.id : newChartId();} catch {this.archiveState.set({kind:'unavailable'});}
        if (id) {
          this.archiveBusy.set(true);
          try {
            const response=await archiveOperation({operation:'save',chart:{id,...data}});
            this.archiveState.set(response);
            if(response.kind==='ready') {savedId=id;this.lastFailedAutosave={signature,id};this.archiveNotice.set('saved');}
            else return;
          } finally {this.archiveBusy.set(false);}
        } else return;
      }
      const result = await calculateChart({utcIso, latMicro: Math.round(lat * 1e6), lngMicro: Math.round(lng * 1e6)});
      if(fromNewChart && result.kind!=='ready') {this.newChartError.set(result.kind);return;}
      if (navigating && result.kind !== 'ready' && previous?.kind === 'ready' && previousPlace) {
        const local = instantToCivilExact(Date.parse(previousUtc), previousPlace.zone);
        if (local) this.setSkyTime(local, previousPlace);
        this.chartResult.set(previous);
        this.navigationCalculationError.set(true);
        return;
      }
      this.closeRelocation();
      this.overlay.set(null);
      this.overlayError.set(false);
      this.mode.set('natal');
      this.chartUtc.set(utcIso);
      this.selectedPlanet.set(null);
      const previousHouse = this.preferredHouse() ?? this.selectedHouse() ?? 'placido';
      this.selectedHouse.set(result.kind === 'ready' ? result.chart.houses.find(h => h.id === previousHouse)?.id ?? result.chart.houses[0]?.id ?? null : null);
      const place = this.chosenPlace;
      const label = destination ? destination.label : navigating && previousPlace ? previousPlace.label : place && place.latitude === lat && place.longitude === lng && (!place.zone || place.zone === this.timezone.trim()) && this.placeQuery() === placeLabel(place) ? this.placeQuery() : '';
      this.chartPlace = result.kind === 'ready' ? {zone: this.timezone.trim(), latitude: this.latitude, longitude: this.longitude, label} : null;
      if(navigating && result.kind==='ready' && this.chartIsSky() && this.chartPlace) this.skyPlace={...this.chartPlace};
      if (!navigating && result.kind==='ready') {this.activeArchiveId.set(savedId);this.sessionName=this.chartInputName.trim();this.lastFailedAutosave=null;}
      if (!navigating) this.navigationBase.set(result.kind === 'ready' && this.chartPlace ? {utcIso, place:{...this.chartPlace}, result} : null);
      this.chartResult.set(result);
      if (!navigating && result.kind === 'ready') {this.chartName.set(this.chartInputName.trim());this.chartIsSky.set(false);this.chartPanel.set('chart');if(fromNewChart) {this.newChartBackup=null;this.tab.set('chart');}}
    } finally { this.calculating.set(false); }
  }
  setNow(): void {
    this.pauseLiveSky();
    this.pendingSkyStep.set(null);
    const local = instantToCivil(Date.now(), this.timezone.trim());
    if (!local) { this.timeError.set('unknown_zone'); return; }
    this.utc = local.civil;
    this.occurrence = local.occurrence;
    this.timeError.set('');
  }
  async navigateToNow(): Promise<void> {
    this.pauseLiveSky();
    const place = this.chartPlace;
    if (this.calculating() || this.overlayBusy() || !place || this.chartResult()?.kind !== 'ready') return;
    const local = instantToCivilExact(Math.floor(Date.now() / 1000) * 1000, place.zone);
    if (!local) { this.navigationCalculationError.set(true); return; }
    await this.applySkyTime(local);
  }
  async navigateSky(direction: -1 | 1, unit:SkyStep=this.skyStep, requestedAmount:number=Number(this.skyAmount)): Promise<void> {
    this.pauseLiveSky();
    const place = this.chartPlace;
    if (this.calculating() || this.overlayBusy() || !place || this.chartResult()?.kind !== 'ready') return;
    this.pendingSkyStep.set(null);
    this.navigationCalculationError.set(false);
    const amount = requestedAmount;
    if (!Number.isInteger(amount) || amount < 1 || amount > 30) { this.navigationError.set(true); return; }
    const next = skyStepTarget(this.chartUtc(), place.zone, unit, amount * direction);
    if (next.kind === 'invalid') { this.navigationError.set(true); return; }
    this.navigationError.set(false);
    if (next.kind !== 'ready') {
      this.pendingSkyStep.set({kind:next.kind, civil:next.civil, baseUtc:this.chartUtc(), zone:place.zone});
      return;
    }
    await this.applySkyTime(next.value);
  }
  stopSkyHold():void {++this.holdGeneration;if(this.holdTimer!==undefined) clearTimeout(this.holdTimer);this.holdTimer=undefined;}
  holdSky(event:PointerEvent,direction:-1|1,unit:SkyStep=this.skyStep,amount:number=Number(this.skyAmount)):void {
    if(event.button!==0 || this.calculating() || this.overlayBusy()) return;
    this.stopSkyHold();
    try {(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);} catch { /* Capture is best effort. */ }
    const generation=this.holdGeneration;
    const move=async (delay:number):Promise<void>=>{
      if(generation!==this.holdGeneration || this.destroyed || this.tab()!=='chart') return;
      await this.navigateSky(direction,unit,amount);
      if(generation!==this.holdGeneration || this.destroyed || this.pendingSkyStep() || this.navigationError() || this.navigationCalculationError()) return;
      this.holdTimer=setTimeout(()=>{this.holdTimer=undefined;void move(90);},delay);
    };
    void move(350);
  }
  clickSky(event:MouseEvent,direction:-1|1,unit:SkyStep=this.skyStep,amount:number=Number(this.skyAmount)):void {
    if(event.detail===0) void this.navigateSky(direction,unit,amount);
  }
  private setSkyTime(value: CivilTime, place: ChartPlace): void {
    this.timezone = place.zone;
    this.latitude = place.latitude;
    this.longitude = place.longitude;
    this.placeQuery.set(place.label);
    this.utc = value.civil;
    this.occurrence = value.occurrence;
  }
  private async applySkyTime(value: CivilTime): Promise<void> {
    const place = this.chartPlace;
    if (!place || this.calculating() || this.overlayBusy() || this.chartResult()?.kind !== 'ready') return;
    this.setSkyTime(value, place);
    await this.calculate(true);
  }
  openRelocation(event: Event): void {
    this.pauseLiveSky();
    const place = this.chartPlace;
    const details = (event.currentTarget as HTMLElement | null)?.parentElement;
    if (!(details instanceof HTMLDetailsElement) || details.open || !place) return;
    ++this.relocationTicket;
    clearTimeout(this.relocationTimer);
    this.relocationLatitude = place.latitude;
    this.relocationLongitude = place.longitude;
    this.relocationZone = place.zone;
    this.relocationLabel = place.label;
    this.relocationQuery.set(place.label);
    this.relocationResults.set([]);
    this.relocationSearchState.set('idle');
    this.relocationError.set('');
    this.relocationMode = 'instant';
    this.relocationOccurrence = '';
  }
  private closeRelocation(): void {
    ++this.relocationTicket;
    clearTimeout(this.relocationTimer);
    this.relocationResults.set([]);
    this.relocationSearchState.set('idle');
    this.relocationError.set('');
    const panel = this.relocationPanel?.nativeElement;
    if (panel) panel.open = false;
  }
  searchRelocation(value: string): void {
    this.relocationQuery.set(value);
    this.relocationLabel = '';
    this.relocationResults.set([]);
    this.relocationSearchState.set('idle');
    const ticket = ++this.relocationTicket;
    clearTimeout(this.relocationTimer);
    if (value.trim().length < 2 || value.trim().length > 80) return;
    this.relocationSearchState.set('loading');
    this.relocationTimer = setTimeout(async () => {
      try {
        const results = await searchPlaceCatalog(value, this.locale());
        if (ticket === this.relocationTicket) { this.relocationResults.set(results); this.relocationSearchState.set('ready'); }
      } catch { if (ticket === this.relocationTicket) this.relocationSearchState.set('error'); }
    }, 200);
  }
  chooseRelocation(place: Place): void {
    if (this.calculating() || this.overlayBusy()) return;
    ++this.relocationTicket;
    clearTimeout(this.relocationTimer);
    this.relocationLatitude = String(place.latitude);
    this.relocationLongitude = String(place.longitude);
    this.relocationZone = place.zone;
    this.relocationLabel = placeLabel(place);
    this.relocationQuery.set(this.relocationLabel);
    this.relocationResults.set([]);
    this.relocationSearchState.set('idle');
    this.relocationError.set('');
  }
  editRelocation(): void { this.relocationLabel = ''; this.relocationError.set(''); this.relocationOccurrence = ''; }
  async relocateChart(): Promise<void> {
    this.pauseLiveSky();
    const place = this.chartPlace;
    if (this.calculating() || this.overlayBusy() || !place || this.chartResult()?.kind !== 'ready') return;
    const plan = planRelocation(this.chartUtc(), place.zone, this.relocationLatitude, this.relocationLongitude,
      this.relocationZone, this.relocationMode, this.relocationOccurrence);
    if (plan.kind !== 'ready') { this.relocationError.set(plan.kind); return; }
    this.relocationError.set('');
    const destination: ChartPlace = {zone:plan.zone, latitude:plan.latitude, longitude:plan.longitude, label:this.relocationLabel};
    this.setSkyTime(plan.local, destination);
    await this.calculate(true, destination);
  }
  restoreNavigation(): void {
    this.pauseLiveSky();
    const base = this.navigationBase();
    if (!base || !this.canRestoreNavigation() || this.calculating() || this.overlayBusy()) return;
    const local = instantToCivilExact(Date.parse(base.utcIso), base.place.zone);
    if (!local) return;
    this.closeRelocation();
    this.setSkyTime(local, base.place);
    this.chartPlace = {...base.place};
    this.chartUtc.set(base.utcIso);
    this.chartResult.set(base.result);
    this.selectedHouse.update(house => base.result.chart.houses.find(item => item.id === house)?.id ?? base.result.chart.houses[0]?.id ?? null);
    this.selectedPlanet.set(null);
    this.pendingSkyStep.set(null);
    this.navigationError.set(false);
    this.navigationCalculationError.set(false);
    this.timeError.set('');
    this.overlay.set(null);
    this.overlayError.set(false);
    this.mode.set('natal');
  }
  async resolveSkyStep(occurrence: 'earlier' | 'later'): Promise<void> {
    const pending = this.pendingSkyStep();
    if (!pending || pending.kind !== 'ambiguous' || pending.baseUtc !== this.chartUtc() || pending.zone !== this.chartPlace?.zone) return;
    await this.applySkyTime({civil:pending.civil, occurrence});
  }
  editNonexistentSkyStep(): void {
    const pending = this.pendingSkyStep(), place = this.chartPlace;
    if (!pending || pending.kind !== 'nonexistent' || !place || pending.baseUtc !== this.chartUtc() || pending.zone !== place.zone || this.calculating() || this.overlayBusy()) return;
    this.setSkyTime({civil:pending.civil, occurrence:''}, place);
    this.pendingSkyStep.set(null);
    this.openNewChart(true);
    this.timeError.set('nonexistent');
    setTimeout(()=>document.getElementById('chart-civil-time')?.focus());
  }
  saveSessionChart(): void {
    this.pauseLiveSky();
    const result = this.chartResult();
    if (this.calculating() || result?.kind !== 'ready' || !this.chartPlace) return;
    const id = this.nextSessionId++;
    const name = this.sessionName.trim().slice(0, 80) || `${this.locale() === 'it' ? 'Tema' : 'Chart'} ${id}`;
    this.sessionCharts.update(charts => [...charts, {id, name, utcIso: this.chartUtc(), place: {...this.chartPlace!}, result, house: this.selectedHouse()}]);
    this.sessionName = '';
  }
  restoreSessionChart(chart: SessionChart, stayOnHome = false): void {
    this.pauseLiveSky();
    if (this.calculating() || this.overlayBusy()) return;
    const local = instantToCivilExact(Date.parse(chart.utcIso), chart.place.zone);
    if (!local) return;
    if(this.chartIsSky() && this.chartPlace) this.skyPlace={...this.chartPlace};
    this.pendingArchiveUpdate.set(false);this.electiveOpen.set(false);this.chartInputName=chart.name;
    this.chartName.set(chart.name);this.chartIsSky.set(false);
    this.activeArchiveId.set(null);
    this.closeRelocation();
    ++this.placeTicket;
    clearTimeout(this.placeTimer);
    this.placeState.set('idle');
    this.placeError.set(false);
    this.chosenPlace = null;
    this.chartPlace = {...chart.place};
    this.timezone = chart.place.zone;
    this.latitude = chart.place.latitude;
    this.longitude = chart.place.longitude;
    this.placeQuery.set(chart.place.label);
    this.placeResults.set([]);
    this.utc = local.civil;
    this.occurrence = local.occurrence;
    this.chartUtc.set(chart.utcIso);
    this.selectedHouse.set(chart.result.chart.houses.find(h=>h.id===(chart.house ?? this.preferredHouse() ?? 'placido'))?.id ?? chart.result.chart.houses[0]?.id ?? null);
    this.selectedPlanet.set(null);
    this.timeError.set('');
    this.navigationError.set(false);
    this.pendingSkyStep.set(null);
    this.chartResult.set(chart.result);
    this.navigationBase.set({utcIso:chart.utcIso, place:{...chart.place}, result:chart.result});
    this.navigationCalculationError.set(false);
    this.overlay.set(null);
    this.mode.set('natal');
    if (!stayOnHome) {this.chartPanel.set('chart');this.tab.set('chart');}
  }
  removeSessionChart(id: number): void {
    this.sessionCharts.update(charts => charts.filter(chart => chart.id !== id));
    if (this.overlay()?.sessionId === id) this.overlay.set(null);
  }
  setChartSettings(settings: ChartSettings): void {
    if(!this.preferencesReady()) return;
    const next = sanitizeChartSettings(settings);
    this.chartSettings.set(next);
    this.persistChartPreferences();
  }
  setHousePreference(house:HouseSystemId):void {
    if(!this.preferencesReady()) return;
    this.preferredHouse.set(house);
    const result=this.chartResult();
    if(result?.kind==='ready') this.selectedHouse.set(result.chart.houses.find(h=>h.id===house)?.id ?? result.chart.houses[0]?.id ?? null);
    else this.selectedHouse.set(house);
    this.persistUiPreferences();
  }
  setMode(mode: string): void {
    this.pauseLiveSky();
    if (mode === 'natal' || mode === 'latitude' || mode === 'transits' || mode === 'synastry') {
      this.mode.set(mode);if(mode==='transits' || mode==='synastry') void this.refreshArchive();
    }
  }
  selectOverlay(id: string): void {
    this.pauseLiveSky();
    this.archivedOverlayId.set('');
    const chart = this.sessionCharts().find(item => String(item.id) === id);
    this.overlay.set(chart ? {chart: chart.result.chart, provider:chart.result.provider, utcIso: chart.utcIso, name: chart.name, sessionId: chart.id} : null);
    this.overlayError.set(false);
  }
  async selectArchivedOverlay(id:string):Promise<void> {
    this.pauseLiveSky();
    const active=this.chartResult(), state=this.archiveState();
    if(!id) {this.archivedOverlayId.set('');this.overlay.set(null);return;}
    if(this.overlayBusy() || this.calculating() || active?.kind!=='ready' || state?.kind!=='ready') return;
    const chart=state.charts.find(item=>item.id===id);
    if(!chart) return;
    const generation=this.startupGeneration;
    this.overlayBusy.set(true);this.overlayError.set(false);
    try {
      const result=await calculateChart({utcIso:chart.utcIso,latMicro:chart.latMicro,lngMicro:chart.lngMicro});
      if(this.chartResult()!==active || this.destroyed || generation!==this.startupGeneration) return;
      if(result.kind!=='ready') {this.overlayError.set(true);return;}
      this.archivedOverlayId.set(id);
      this.overlay.set({chart:result.chart,provider:result.provider,utcIso:chart.utcIso,name:chart.name,sessionId:null});
    } finally {this.overlayBusy.set(false);}
  }
  async currentSky(): Promise<void> {
    this.pauseLiveSky();
    const place = this.chartPlace;
    const active = this.chartResult();
    const origin = this.tab();
    if (!place || active?.kind !== 'ready' || this.calculating() || this.overlayBusy()) return;
    this.overlayBusy.set(true);
    this.overlayError.set(false);
    try {
      const utcIso = new Date().toISOString();
      const result = await calculateChart({utcIso, latMicro: Math.round(Number(place.latitude) * 1e6), lngMicro: Math.round(Number(place.longitude) * 1e6)});
      if (this.chartResult() !== active || this.tab() !== origin || this.destroyed) return;
      if (result.kind !== 'ready') { this.overlayError.set(true); return; }
      this.overlay.set({chart: result.chart, provider:result.provider, utcIso, name: this.locale() === 'it' ? 'Cielo attuale' : 'Current sky', sessionId: null});
      this.mode.set('transits');
    } finally {this.overlayBusy.set(false);}
  }
  readonly tab = signal<Tab>('chart');
  readonly chartPanel = signal<ChartPanel>('chart');
  readonly locale = signal<Locale>(deviceLocale());
  readonly theme = signal<UiTheme>('light');
  readonly runtime = signal<string | null>(null);
  readonly navTabs: readonly ('chart'|'archive'|'settings')[] = ['chart', 'archive', 'settings'];
  readonly settingsPage=signal<SettingsPage|null>(null);
  readonly settingsQuery=signal('');
  readonly settingsResults=computed(()=>filterSettings(this.settingsQuery()));
  settingTitle(page:SettingsPage):string {const entry=SETTINGS_ENTRIES.find(item=>item.id===page);return entry ? entry[this.locale()] : '';}
  openSetting(page:SettingsPage):void {this.settingsPage.set(page);this.ephemerisResult.set('');}
  readonly elementNames={it:{fire:'Fuoco',earth:'Terra',air:'Aria',water:'Acqua'},en:{fire:'Fire',earth:'Earth',air:'Air',water:'Water'}} as const;

  t(key: keyof typeof messages.it): string {
    return messages[this.locale()][key];
  }

  navigate(tab: Tab): void {
    if(this.tab()==='new-chart' && (this.calculating() || this.archiveBusy())) return;
    ++this.startupGeneration;
    this.stopSkyHold();
    this.pendingArchiveUpdate.set(false);this.electiveOpen.set(false);
    if(this.tab()==='new-chart' && tab!=='new-chart') this.cancelNewChart();
    if (tab !== 'chart') this.pauseLiveSky();
    this.tab.set(tab);
    if(tab === 'settings') this.settingsPage.set(null);
    if(tab === 'archive' || tab === 'settings') { this.pendingArchiveDelete.set(null); void this.refreshArchive(); }
  }
  setChartPanel(panel:ChartPanel):void {
    if(panel==='chart' || panel==='latitude') {this.mode.set(panel==='latitude'?'latitude':'natal');this.overlay.set(null);}
    this.chartPanel.set(panel);
  }
  retryStartup():void {void this.initializeStartup();}

  setStartup(mode:'sky'|'natal-transits',chartId:string|null=this.startup().chartId):void {
    if(mode==='natal-transits' && !chartId) return;
    const value:StartupPreference={mode,chartId};this.startup.set(value);
    const version=++this.startupWriteVersion;this.startupSaving.set(true);this.startupStorageError.set(false);
    this.startupWriteQueue=this.startupWriteQueue.then(()=>writeStartup(value),()=>writeStartup(value));
    void this.startupWriteQueue.then(ok=>{if(version===this.startupWriteVersion && !this.destroyed) {this.startupSaving.set(false);this.startupStorageError.set(!ok);}});
  }
  private async initializeStartup():Promise<void> {
    const ticket=++this.startupGeneration;
    const preferenceVersion=this.startupWriteVersion;
    const current=()=>!this.destroyed && ticket===this.startupGeneration && this.tab()==='chart';
    this.startupBusy.set(true);
    try {
      const stored=await readStartup();
      const preference=stored.kind==='ready' ? stored.preference : DEFAULT_STARTUP;
      if(!this.destroyed && this.startupWriteVersion===preferenceVersion) {
        this.startup.set(preference);this.startupStorageError.set(stored.kind!=='ready');
      }
      if(!current() || this.startupWriteVersion!==preferenceVersion) return;
      let chosen:SavedChartV1|undefined;
      if(preference.mode==='natal-transits' && preference.chartId) {
        const archive=await archiveOperation({operation:'list'});
        if(!current()) return;
        this.archiveState.set(archive);
        if(archive.kind==='ready') chosen=archive.charts.find(chart=>chart.id===preference.chartId);
        if(preference.mode==='natal-transits' && (!chosen || archive.kind!=='ready')) {
          if(archive.kind==='ready') this.archiveState.set({kind:'not_found'});
          this.tab.set('archive');return;
        }
      }
      const place:ChartPlace=chosen ? {zone:chosen.timeZone,latitude:String(chosen.latMicro/1e6),longitude:String(chosen.lngMicro/1e6),label:chosen.placeName}
        : {zone:'Europe/Rome',latitude:'41.893',longitude:'12.483',label:'Roma'};
      const utcIso=preference.mode==='natal-transits' && chosen ? chosen.utcIso : new Date().toISOString();
      const result=await calculateChart({utcIso,latMicro:Math.round(Number(place.latitude)*1e6),lngMicro:Math.round(Number(place.longitude)*1e6)});
      if(!current()) return;
      if(result.kind!=='ready') {this.chartResult.set(result);return;}
      this.restoreSessionChart({id:0,name:chosen?.name ?? '',utcIso,place,result,house:null},true);
      this.chartIsSky.set(!chosen);this.chartPanel.set('chart');
      if(!chosen) {this.skyPlace={...place};this.toggleLiveSky();}
      if(preference.mode==='natal-transits' && chosen) {
        this.activeArchiveId.set(chosen.id);this.sessionName=chosen.name;
      }
    } finally {this.startupBusy.set(false);}
  }

  async openCurrentSky():Promise<void> {
    if(this.calculating() || this.overlayBusy() || this.tab()!=='chart') return;
    if(this.chartIsSky()) {this.toggleLiveSky();return;}
    this.pauseLiveSky();this.stopSkyHold();this.skyReturnError.set(false);
    const generation=++this.startupGeneration, place={...this.skyPlace};
    const utcIso=new Date(Math.floor(Date.now()/1000)*1000).toISOString();
    this.calculating.set(true);
    try {
      const result=await calculateChart({utcIso,latMicro:Math.round(Number(place.latitude)*1e6),lngMicro:Math.round(Number(place.longitude)*1e6)});
      if(this.destroyed || generation!==this.startupGeneration || this.tab()!=='chart') return;
      if(result.kind!=='ready') {this.skyReturnError.set(true);return;}
      this.calculating.set(false);
      this.restoreSessionChart({id:0,name:'',utcIso,place,result,house:null},true);
      this.chartIsSky.set(true);this.chartPanel.set('chart');
      this.toggleLiveSky();
    } finally {this.calculating.set(false);}
  }

  toggleLiveSky(): void {
    if (this.liveSky()) { this.pauseLiveSky(); return; }
    if (this.destroyed || document.hidden || this.liveSkyBusy() || this.calculating() || this.overlayBusy() ||
        !this.chartPlace || this.chartResult()?.kind !== 'ready' || this.tab() !== 'chart') return;
    this.pendingSkyStep.set(null);
    this.navigationError.set(false);
    this.navigationCalculationError.set(false);
    this.liveSky.set(true);
    const generation = ++this.liveSkyGeneration;
    this.liveSkyTimer = setInterval(() => { void this.refreshLiveSky(generation); }, 33_000);
    void this.refreshLiveSky(generation);
  }
  pauseLiveSky(): void {
    if (!this.liveSky() && this.liveSkyTimer === undefined) return;
    ++this.liveSkyGeneration;
    this.liveSky.set(false);
    if (this.liveSkyTimer !== undefined) clearInterval(this.liveSkyTimer);
    this.liveSkyTimer = undefined;
  }
  private async refreshLiveSky(generation: number): Promise<void> {
    const place = this.chartPlace, active = this.chartResult();
    if (document.hidden) { this.pauseLiveSky(); return; }
    if (this.destroyed || !this.liveSky() || generation !== this.liveSkyGeneration ||
        this.tab() !== 'chart' || this.liveSkyBusy() || this.calculating() || this.overlayBusy() || !place || active?.kind !== 'ready') return;
    const epoch = Math.floor(Date.now() / 1000) * 1000;
    const local = instantToCivilExact(epoch, place.zone);
    if (!local) { this.pauseLiveSky(); this.navigationCalculationError.set(true); return; }
    const utcIso = new Date(epoch).toISOString();
    this.liveSkyBusy.set(true);
    try {
      const result = await calculateChart({utcIso, latMicro:Math.round(Number(place.latitude) * 1e6), lngMicro:Math.round(Number(place.longitude) * 1e6)});
      if (document.hidden) { this.pauseLiveSky(); return; }
      if (this.destroyed || !this.liveSky() || generation !== this.liveSkyGeneration ||
          this.tab() !== 'chart' || this.chartResult() !== active || this.chartPlace !== place) return;
      if (result.kind !== 'ready') { this.pauseLiveSky(); this.navigationCalculationError.set(true); return; }
      this.closeRelocation();
      this.setSkyTime(local, place);
      this.chartUtc.set(utcIso);
      this.selectedHouse.update(house => result.chart.houses.find(item => item.id === house)?.id ?? result.chart.houses[0]?.id ?? null);
      if (!result.chart.bodies.some(body => body.id === this.selectedPlanet())) this.selectedPlanet.set(null);
      this.overlay.set(null);
      this.overlayError.set(false);
      this.chartResult.set(result);
    } finally { this.liveSkyBusy.set(false); }
  }

  switchLocale(): void {
    if(!this.preferencesReady()) return;
    this.locale.update(value => value === 'it' ? 'en' : 'it');
    document.documentElement.lang = this.locale();
    this.persistUiPreferences();
  }
  setLocale(value:Locale):void {if(!this.preferencesReady()) return;this.locale.set(value);document.documentElement.lang=value;this.persistUiPreferences();}

  switchTheme(): void {
    if(!this.preferencesReady()) return;
    this.theme.update(value => value === 'dark' ? 'light' : 'dark');
    document.documentElement.dataset['theme'] = this.theme();
    this.persistUiPreferences();
  }
  setTheme(value:UiTheme):void {if(!this.preferencesReady()) return;this.theme.set(value);document.documentElement.dataset['theme']=value;this.persistUiPreferences();}

  private persistUiPreferences(): void {
    const snapshot={theme:this.theme(),locale:this.locale(),houseSystem:this.preferredHouse()};
    const version=++this.uiPreferenceVersion;this.uiPreferencesSaving.set(true);
    this.uiPreferenceQueue=this.uiPreferenceQueue.then(()=>writeDeviceUi(snapshot),()=>writeDeviceUi(snapshot));
    void this.uiPreferenceQueue.then(ok=>{if(!this.destroyed && version===this.uiPreferenceVersion) {this.uiPreferencesSaving.set(false);this.uiPreferencesError.set(!ok);}});
  }
  private persistChartPreferences():void {
    const snapshot=sanitizeChartSettings(this.chartSettings()),version=++this.chartPreferenceVersion;this.chartPreferencesSaving.set(true);
    this.chartPreferenceQueue=this.chartPreferenceQueue.then(()=>writeDeviceChart(snapshot),()=>writeDeviceChart(snapshot));
    void this.chartPreferenceQueue.then(ok=>{if(!this.destroyed && version===this.chartPreferenceVersion) {this.chartPreferencesSaving.set(false);this.chartPreferencesError.set(!ok);}});
  }
  retryDisplayPreferences():void {
    if(!this.preferencesReady()) return;
    if(this.uiPreferencesError()) this.persistUiPreferences();
    if(this.chartPreferencesError()) this.persistChartPreferences();
  }
  private async initializeDisplayPreferences():Promise<void> {
    const [ui,chart]=await Promise.all([readDeviceUi(),readDeviceChart()]);
    if(this.destroyed) return;
    this.theme.set(ui.value.theme);this.locale.set(ui.value.locale);this.preferredHouse.set(ui.value.houseSystem ?? 'placido');
    document.documentElement.lang=ui.value.locale;document.documentElement.dataset['theme']=ui.value.theme;
    this.chartSettings.set(chart.value);
    const result=this.chartResult();
    if(result?.kind==='ready' && ui.value.houseSystem && result.chart.houses.some(h=>h.id===ui.value.houseSystem)) this.selectedHouse.set(ui.value.houseSystem);
    this.uiPreferencesError.set(!ui.persisted);this.chartPreferencesError.set(!chart.persisted);
    this.preferencesReady.set(true);
    void this.initializeStartup();
  }

  ngOnInit(): void {
    void this.refreshEphemeris();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.initializeDisplayPreferences();
    invoke<RuntimeInfo>('runtime_info')
      .then(info => {
        if (info.schema_version === 1 && info.mode === 'prototype') {
          this.runtime.set(info.platform);
        }
      })
      .catch(() => this.runtime.set(null)); // Expected in the browser.
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.startupGeneration;this.stopSkyHold();
    this.ephemerisAbort?.abort();
    this.pauseLiveSky();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    clearTimeout(this.placeTimer);
    clearTimeout(this.relocationTimer);
    ++this.placeTicket;
    ++this.relocationTicket;
  }
}
