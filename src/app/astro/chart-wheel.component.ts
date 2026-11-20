import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, signal } from '@angular/core';
import { defaultOpzioniGrafico, GestoreImmagini, GraficoRenderService, TemaRender } from 'grafici-astrologici';
import type { ChartProviderV1, ChartSnapshotV1, HouseSystemId } from '../native/chart-calculation-contract';
import { nextPlanetSelection } from './planet-selection';
import { buildTemaRenderData } from './tema-render-data';
import {ASPECT_DEFINITIONS, AXIS_IDS, POINT_IDS, type ChartSettings} from '../chart-settings';
import {applyChartSettings} from './render-options';
import {sharpenCanvas, transparentChartBackground} from './canvas-resolution';
import type {UiTheme} from '../ui-preferences';

export type ChartMode = 'natal' | 'latitude' | 'transits' | 'synastry';
export type OverlayChart = Readonly<{chart: ChartSnapshotV1; utcIso: string; provider:ChartProviderV1}>;
type PlanetInteraction = Readonly<{type: string; planet: {layer: string; name: string}}>;
type OptionalPlanetInteractions = {
  highlightPlanet?: (target: {layer: 'natal'; name: string} | null) => void;
  setPlanetInteractionListener?: (listener: ((event: PlanetInteraction) => void) | null) => void;
};

@Component({
  selector: 'vs-chart-wheel', standalone: true,
  template: `<section class="wheel">
    <div class="chart-viewport" tabindex="0" [attr.aria-label]="locale === 'it' ? 'Area scorrevole della carta' : 'Scrollable chart area'">
      <canvas #surface [style.width.%]="zoomLevels[zoomIndex()] * 100" [style.visibility]="hasRendered() ? 'visible' : 'hidden'" [attr.aria-label]="locale === 'it' ? 'Carta astrologica' : 'Astrological chart'"></canvas>
    </div>
    @if (state() === 'loading' && !hasRendered()) { <p role="status">{{ locale === 'it' ? 'Disegno della carta…' : 'Drawing chart…' }}</p> }
    @if (state() === 'error') { <p role="alert">{{ locale === 'it' ? 'Grafico non disponibile. Verifica che il sistema di case sia disponibile per entrambi i temi.' : 'Chart unavailable. Check that the house system is available for both charts.' }}</p> }
    @if (showHouseSelector && chart.houses.length) {
      <label>{{ locale === 'it' ? 'Sistema di case' : 'House system' }}
        <select [value]="selectedHouse()" [disabled]="state() === 'loading' || !housePreferenceReady" (change)="changeHouse($any($event.target).value)">
          @for (house of chart.houses; track house.id) { <option [value]="house.id">{{ house.id }}</option> }
        </select>
      </label>
    }
    <ng-content select="[sky-controls]" />
    <div class="zoom-controls" role="group" [attr.aria-label]="locale === 'it' ? 'Ingrandimento della carta' : 'Chart zoom'">
      <button type="button" [disabled]="zoomIndex() === 0" (click)="zoomIndex.set(zoomIndex() - 1)" [attr.aria-label]="locale === 'it' ? 'Riduci carta' : 'Zoom out'">−</button>
      <span aria-live="polite">{{ zoomLevels[zoomIndex()] * 100 }}%</span>
      <button type="button" [disabled]="zoomIndex() === zoomLevels.length - 1" (click)="zoomIndex.set(zoomIndex() + 1)" [attr.aria-label]="locale === 'it' ? 'Ingrandisci carta' : 'Zoom in'">+</button>
      <button type="button" [disabled]="zoomIndex() === 0" (click)="zoomIndex.set(0)">{{ locale === 'it' ? 'Adatta' : 'Fit' }}</button>
    </div>
    </section>`,
  styles: [`.wheel { margin: 20px 0; text-align:center; } .chart-viewport { width:100%; max-width:440px; aspect-ratio:1; overflow:auto; margin:auto; } canvas { aspect-ratio:1; display:block; } .zoom-controls { display:flex; justify-content:center; align-items:center; flex-wrap:wrap; gap:8px; margin:12px 0; } .zoom-controls button { min-width:44px; min-height:44px; padding:8px 12px; color:var(--text,#fff); background:var(--surface,#151d30); border:1px solid var(--border,#57617b); border-radius:9px; } button:disabled { opacity:.45; } .zoom-controls span { min-width:48px; font-size:14px; } p { font-size:12px; color:var(--accent,#e5c895); } label { display:grid; gap:8px; text-align:left; margin-bottom:16px; font-size:14px; } select { width:100%; padding:12px; color:var(--text,#fff); background:var(--surface,#151d30); border:1px solid var(--border,#57617b); border-radius:9px; }`],
})
export class ChartWheelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({required:true}) chart!: ChartSnapshotV1;
  @Input({required:true}) utcIso!: string;
  @Input() locale: 'it' | 'en' = 'it';
  @Input() theme: UiTheme = 'dark';
  @Input() activeHouse: HouseSystemId | null = null;
  @Input() housePreferenceReady = true;
  @Input() showHouseSelector = false;
  @Input() activePlanet: string | null = null;
  @Input({required:true}) settings!: ChartSettings;
  @Input() mode: ChartMode = 'natal';
  @Input() overlay: OverlayChart | null = null;
  @Output() readonly houseChange = new EventEmitter<HouseSystemId>();
  @Output() readonly planetChange = new EventEmitter<string | null>();
  @ViewChild('surface', {static:true}) surface!: ElementRef<HTMLCanvasElement>;
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly hasRendered = signal(false);
  readonly interactionsAvailable = signal(false);
  readonly selectedHouse = signal<HouseSystemId | ''>('');
  readonly zoomLevels = [1, 1.25, 1.5, 2, 2.5, 3];
  readonly zoomIndex = signal(0);
  private readonly renderer = new GraficoRenderService() as GraficoRenderService & OptionalPlanetInteractions;
  private disposed = false;
  private initialized = false;
  private revision = 0;
  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private contextLost = false;
  private updateResolution = ():void => {
    if (!this.disposed && this.initialized && !this.contextLost) sharpenCanvas(this.renderer,this.surface.nativeElement,window.devicePixelRatio);
  };
  private readonly onWindowResize = ():void => {
    clearTimeout(this.resizeTimer);
    // The shared renderer has its own 150 ms resize handler which resets DPR.
    this.resizeTimer=setTimeout(this.updateResolution,220);
  };
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    ++this.revision;
    this.contextLost = true;
    this.hasRendered.set(false);
    if (!this.disposed) this.state.set('loading');
  };
  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    if (!this.disposed) void this.render();
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['activePlanet'] && this.initialized && !this.disposed) this.syncPlanetFocus();
    if (this.initialized && !this.disposed) {
      const active=this.chart.houses.find(h=>h.id===this.activeHouse);
      const houseChanged=!!active && active.id!==this.selectedHouse() && !!(changes['activeHouse'] || changes['chart']);
      if(houseChanged) this.selectedHouse.set(active!.id);
      if (!this.chart.houses.some(h => h.id === this.selectedHouse())) this.selectedHouse.set(this.chart.houses.find(h=>h.id==='placido')?.id ?? this.chart.houses[0]?.id ?? '');
      if(houseChanged || changes['chart'] || changes['utcIso'] || changes['settings'] || changes['mode'] || changes['overlay'] || changes['theme']) void this.render();
    }
  }
  private syncPlanetFocus(): void {
    const name = this.activePlanet;
    if (typeof this.renderer.highlightPlanet === 'function') this.renderer.highlightPlanet(name && this.chart.bodies.some(body => body.id === name) ? {layer:'natal',name} : null);
  }
  private onPlanetInteraction = (event: PlanetInteraction): void => {
    if (this.disposed || this.state() !== 'ready' || event.type !== 'click' || event.planet.layer !== 'natal') return;
    const name = event.planet.name;
    const next = nextPlanetSelection(this.chart.bodies, this.activePlanet, name);
    if (next !== this.activePlanet) this.planetChange.emit(next);
  };
  ngAfterViewInit(): void {
    this.interactionsAvailable.set(typeof this.renderer.highlightPlanet === 'function' && typeof this.renderer.setPlanetInteractionListener === 'function');
    const first = this.chart.houses[0];
    if (!first) { this.state.set('error'); return; }
    const selected = this.chart.houses.find(house => house.id === this.activeHouse);
    this.selectedHouse.set(selected?.id ?? this.chart.houses.find(house=>house.id==='placido')?.id ?? first.id);
    void this.render();
  }
  ngOnDestroy(): void {
    this.disposed = true;
    ++this.revision;
    this.resizeObserver?.disconnect();
    clearTimeout(this.resizeTimer);
    window.removeEventListener('resize',this.onWindowResize);
    const canvas = this.surface.nativeElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (typeof this.renderer.setPlanetInteractionListener === 'function') this.renderer.setPlanetInteractionListener(null);
    this.renderer.ngOnDestroy();
  }
  changeHouse(id: string): void {
    if (this.disposed || this.state() === 'loading' || !this.chart.houses.some(house => house.id === id)) return;
    if (id === this.selectedHouse()) return;
    this.selectedHouse.set(id as HouseSystemId);
    this.houseChange.emit(id as HouseSystemId);
    void this.render();
  }

  private sceneInputs() {
    const data = buildTemaRenderData(this.chart, this.utcIso);
    if (!data || !this.selectedHouse()) throw new Error('No house system available');
    const options = structuredClone(defaultOpzioniGrafico);
    const appearance = this.theme;
    options.settaggi.skin_id = appearance === 'light' ? 'light-bn' : 'dark-bn';
    options.temaGrafico = appearance === 'light' ? 'light-bn' : 'dark-bn';
    options.settaggi.domificazione_selezionata = this.selectedHouse();
    const mode = this.mode;
    const overlayData = this.overlay ? buildTemaRenderData(this.overlay.chart, this.overlay.utcIso) : null;
    if ((mode === 'transits' || mode === 'synastry') && !overlayData) throw new Error('No comparison chart available');
    if (mode === 'synastry' && overlayData && !overlayData.houses[this.selectedHouse()]) throw new Error('House system unavailable for comparison chart');
    options.mostraTransiti = mode === 'transits';
    options.mostraSinastria = mode === 'synastry';
    applyChartSettings(options, data.planets, this.settings, {aspects: ASPECT_DEFINITIONS, axes: AXIS_IDS, points: POINT_IDS});
    const chart = Object.assign(new TemaRender(), data);
    const none = null as unknown as TemaRender;
    return {chart, none, comparison: overlayData ? Object.assign(new TemaRender(), overlayData) : none, options, mode, appearance};
  }

  private async render(): Promise<void> {
    const ticket = ++this.revision;
    this.state.set('loading');
    try {
      if (!this.initialized) {
        GestoreImmagini.configurePublicAssetsBase('/assets/');
        const canvas = this.surface.nativeElement;
        canvas.addEventListener('webglcontextlost', this.onContextLost);
        canvas.addEventListener('webglcontextrestored', this.onContextRestored);
        if (this.interactionsAvailable()) this.renderer.setPlanetInteractionListener?.(this.onPlanetInteraction);
        this.renderer.inizializzaGraficoRender(this.surface, {x:800, y:800});
        this.syncPlanetFocus();
        this.initialized = true;
        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver=new ResizeObserver(this.updateResolution);
          this.resizeObserver.observe(canvas);
        }
        window.addEventListener('resize',this.onWindowResize);
      }
      const {chart, comparison, none, options, mode} = this.sceneInputs();
      await this.renderer.disegnaScena(chart, mode === 'transits' ? comparison : none,
        mode === 'synastry' ? comparison : none, mode === 'latitude' ? 'latitudini' : 'carta-astrale', options);
      if (!this.disposed && ticket === this.revision) { transparentChartBackground(this.renderer); this.updateResolution(); this.syncPlanetFocus(); this.hasRendered.set(true); this.state.set('ready'); }
    } catch {
      if (!this.disposed && ticket === this.revision) this.state.set('error');
    }
  }
}
