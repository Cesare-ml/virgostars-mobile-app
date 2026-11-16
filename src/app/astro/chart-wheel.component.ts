import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, signal } from '@angular/core';
import { defaultOpzioniGrafico, GestoreImmagini, GraficoRenderService, TemaRender } from 'grafici-astrologici';
import type { ChartPlanetInteractionEvent } from 'grafici-astrologici';
import type { ChartSnapshotV1, HouseSystemId } from '../native/chart-calculation-contract';
import { nextPlanetSelection } from './planet-selection';
import { buildTemaRenderData } from './tema-render-data';

@Component({
  selector: 'vs-chart-wheel', standalone: true,
  template: `<section class="wheel">
    @if (chart.houses.length) {
      <label>{{ locale === 'it' ? 'Sistema di case' : 'House system' }}
        <select [value]="selectedHouse()" [disabled]="state() === 'loading'" (change)="changeHouse($any($event.target).value)">
          @for (house of chart.houses; track house.id) { <option [value]="house.id">{{ house.id }}</option> }
        </select>
      </label>
    }
    <p>{{ locale === 'it' ? 'Tocca un pianeta nella carta o selezionalo nella lista. Ingrandisci e scorri per esplorare la ruota.' : 'Tap a planet on the chart or select it in the list. Zoom in and scroll to explore the wheel.' }}</p>
    <div class="zoom-controls" role="group" [attr.aria-label]="locale === 'it' ? 'Ingrandimento della carta' : 'Chart zoom'">
      <button type="button" [disabled]="zoomIndex() === 0" (click)="zoomIndex.set(zoomIndex() - 1)" [attr.aria-label]="locale === 'it' ? 'Riduci carta' : 'Zoom out'">−</button>
      <span aria-live="polite">{{ zoomLevels[zoomIndex()] * 100 }}%</span>
      <button type="button" [disabled]="zoomIndex() === zoomLevels.length - 1" (click)="zoomIndex.set(zoomIndex() + 1)" [attr.aria-label]="locale === 'it' ? 'Ingrandisci carta' : 'Zoom in'">+</button>
      <button type="button" [disabled]="zoomIndex() === 0" (click)="zoomIndex.set(0)">{{ locale === 'it' ? 'Adatta' : 'Fit' }}</button>
    </div>
    <div class="chart-viewport" tabindex="0" [attr.aria-label]="locale === 'it' ? 'Area scorrevole della carta' : 'Scrollable chart area'">
      <canvas #surface [style.width.%]="zoomLevels[zoomIndex()] * 100" [attr.aria-label]="locale === 'it' ? 'Carta astrologica' : 'Astrological chart'"></canvas>
    </div>
    <p aria-live="polite">{{ locale === 'it' ? 'Selezionato' : 'Selected' }}: {{ activePlanet ?? '—' }}</p>
    @if (state() === 'loading') { <p role="status">{{ locale === 'it' ? 'Disegno della carta…' : 'Drawing chart…' }}</p> }
    @if (state() === 'error') { <p role="alert">{{ locale === 'it' ? 'Grafico non disponibile.' : 'Chart unavailable.' }}</p> }
    <p>{{ locale === 'it' ? 'Simboli Noto; altre grafiche provvisorie' : 'Noto symbols; other artwork is provisional' }}</p></section>`,
  styles: [`.wheel { margin: 20px 0; text-align:center; } .chart-viewport { width:100%; max-width:440px; aspect-ratio:1; overflow:auto; margin:auto; } canvas { aspect-ratio:1; display:block; } .zoom-controls { display:flex; justify-content:center; align-items:center; gap:8px; margin:12px 0; } .zoom-controls button { min-width:44px; min-height:44px; padding:8px 12px; color:#fff; background:#151d30; border:1px solid #57617b; border-radius:9px; } .zoom-controls button:disabled { opacity:.45; } .zoom-controls span { min-width:48px; font-size:14px; } p { font-size:12px; color:#e5c895; } label { display:grid; gap:8px; text-align:left; margin-bottom:16px; font-size:14px; } select { width:100%; padding:12px; color:#fff; background:#151d30; border:1px solid #57617b; border-radius:9px; }`],
})
export class ChartWheelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({required:true}) chart!: ChartSnapshotV1;
  @Input({required:true}) utcIso!: string;
  @Input() locale: 'it' | 'en' = 'it';
  @Input() activeHouse: HouseSystemId | null = null;
  @Input() activePlanet: string | null = null;
  @Output() readonly houseChange = new EventEmitter<HouseSystemId>();
  @Output() readonly planetChange = new EventEmitter<string | null>();
  @ViewChild('surface', {static:true}) surface!: ElementRef<HTMLCanvasElement>;
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly selectedHouse = signal<HouseSystemId | ''>('');
  readonly zoomLevels = [1, 1.25, 1.5, 1.75, 2];
  readonly zoomIndex = signal(0);
  private readonly renderer = new GraficoRenderService();
  private disposed = false;
  private initialized = false;
  private revision = 0;
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    ++this.revision;
    if (!this.disposed) this.state.set('loading');
  };
  private readonly onContextRestored = (): void => {
    if (!this.disposed) void this.render();
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['activePlanet'] && this.initialized && !this.disposed) this.syncPlanetFocus();
  }
  private syncPlanetFocus(): void {
    const name = this.activePlanet;
    this.renderer.highlightPlanet(name && this.chart.bodies.some(body => body.id === name) ? {layer:'natal',name} : null);
  }
  private onPlanetInteraction = (event: ChartPlanetInteractionEvent): void => {
    if (this.disposed || this.state() !== 'ready' || event.type !== 'click' || event.planet.layer !== 'natal') return;
    const name = event.planet.name;
    const next = nextPlanetSelection(this.chart.bodies, this.activePlanet, name);
    if (next !== this.activePlanet) this.planetChange.emit(next);
  };
  ngAfterViewInit(): void {
    const first = this.chart.houses[0];
    if (!first) { this.state.set('error'); return; }
    const selected = this.chart.houses.find(house => house.id === this.activeHouse);
    this.selectedHouse.set(selected?.id ?? first.id);
    void this.render();
  }
  ngOnDestroy(): void {
    this.disposed = true;
    ++this.revision;
    const canvas = this.surface.nativeElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.setPlanetInteractionListener(null);
    this.renderer.ngOnDestroy();
  }
  changeHouse(id: string): void {
    if (this.disposed || this.state() === 'loading' || !this.chart.houses.some(house => house.id === id)) return;
    if (id === this.selectedHouse()) return;
    this.selectedHouse.set(id as HouseSystemId);
    this.houseChange.emit(id as HouseSystemId);
    void this.render();
  }

  private async render(): Promise<void> {
    const ticket = ++this.revision;
    this.state.set('loading');
    try {
      const data = buildTemaRenderData(this.chart, this.utcIso);
      if (!data || !this.selectedHouse()) throw new Error('No house system available');
      if (!this.initialized) {
        GestoreImmagini.configurePublicAssetsBase('/assets/');
        const canvas = this.surface.nativeElement;
        canvas.addEventListener('webglcontextlost', this.onContextLost);
        canvas.addEventListener('webglcontextrestored', this.onContextRestored);
        this.renderer.setPlanetInteractionListener(this.onPlanetInteraction);
        this.renderer.inizializzaGraficoRender(this.surface, {x:800, y:800});
        this.syncPlanetFocus();
        this.initialized = true;
      }
      const options = structuredClone(defaultOpzioniGrafico);
      options.settaggi.skin_id = 'dark-bn';
      options.temaGrafico = 'dark-bn';
      options.settaggi.domificazione_selezionata = this.selectedHouse();
      options.mostraTransiti = false;
      options.mostraSinastria = false;
      options.mostraAspetti = false;
      const points = options.settaggi.elementi_celesti as unknown as Record<string, {att:boolean; aspVerso:boolean}>;
      for (const [id, point] of Object.entries(points)) {
        point.att = Object.hasOwn(data.planets, id);
        point.aspVerso = false;
      }
      const theme = Object.assign(new TemaRender(), data);
      const none = null as unknown as TemaRender;
      await this.renderer.disegnaScena(theme, none, none, 'carta-astrale', options);
      if (!this.disposed && ticket === this.revision) this.state.set('ready');
    } catch {
      if (!this.disposed && ticket === this.revision) this.state.set('error');
    }
  }
}