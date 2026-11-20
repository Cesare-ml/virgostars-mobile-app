import {Component, EventEmitter, Input, Output} from '@angular/core';
import {ASPECT_DEFINITIONS, POINT_IDS, defaultChartSettings, parseOrb, sanitizeChartSettings,
  type AspectId, type ChartSettings, type PointId} from './chart-settings';
import {pointLabel} from './astro/point-labels';
import {pointGlyph} from './astro/glyph-paths';

const ASPECT_LABELS: Record<AspectId, [string, string]> = {
  congiunzione:['Congiunzione','Conjunction'], opposizione:['Opposizione','Opposition'], trigono:['Trigono','Trine'],
  quadrato:['Quadrato','Square'], sestile:['Sestile','Sextile'], quinconce:['Quinconce','Quincunx'],
  semisestile:['Semisestile','Semisextile'], semiquadrato:['Semiquadrato','Semisquare'], quintile:['Quintile','Quintile'],
  biquintile:['Biquintile','Biquintile'], semiquintile:['Semiquintile','Semiquintile'], novile:['Novile','Novile'],
  settile:['Settile','Septile'], phisolare:['Phi solare','Solar phi'], philunare:['Phi lunare','Lunar phi'],
  parallelodideclinazione:['Parallelo di declinazione','Declination parallel'], antiparallelo:['Antiparallelo','Contraparallel'],
};
export function aspectLabel(id: string, locale: 'it'|'en'): string {
  return ASPECT_LABELS[id as AspectId]?.[locale === 'it' ? 0 : 1] ?? id;
}
const ASPECT_SYMBOLS:Record<AspectId,string> = {
  congiunzione:'☌', opposizione:'☍', trigono:'△', quadrato:'□', sestile:'⚹', quinconce:'⚻',
  semisestile:'⚺', semiquadrato:'∠', quintile:'Q', biquintile:'bQ', semiquintile:'½Q', novile:'N', settile:'S',
  phisolare:'Φ☉', philunare:'Φ☽', parallelodideclinazione:'∥', antiparallelo:'∦',
};
export function aspectSymbol(id:string):string { return ASPECT_SYMBOLS[id as AspectId] ?? '·'; }

@Component({
  selector: 'vs-chart-settings', standalone: true,
  template: `
    <section class="settings">
      @if (invalidOrb) { <p role="alert">{{locale === 'it' ? 'Orbita non valida: usa un valore fino a 15°.' : 'Invalid orb: use a value up to 15°.'}}</p> }
      @if (section === 'aspects') {
        @if (selectedAspect; as selected) {
          <button type="button" (click)="selectedAspect = null">← {{locale === 'it' ? 'Aspetti' : 'Aspects'}}</button>
          <h2>{{aspectLabel(selected)}}</h2>
          <label class="check"><input type="checkbox" [checked]="settings.aspects[selected].active" (change)="setAspect(selected, $any($event.target).checked)"> {{locale === 'it' ? 'Attivo' : 'Enabled'}}</label>
          <label>{{locale === 'it' ? 'Orbita' : 'Orb'}} <input class="orb" type="text" inputmode="decimal" maxlength="4" placeholder="—" [attr.aria-label]="(locale === 'it' ? 'Orbita ' : 'Orb ') + aspectLabel(selected)" [value]="settings.aspects[selected].orb ?? ''" (change)="setAspectOrb(selected, $any($event.target))"></label>
        } @else {
        <label class="check"><input type="checkbox" [checked]="settings.showAspects" (change)="setVisible($any($event.target).checked)"> {{locale === 'it' ? 'Mostra le linee degli aspetti' : 'Show aspect lines'}}</label>
        @for (aspect of aspects; track aspect.id) {
          <button class="option" type="button" (click)="selectedAspect = aspect.id"><span>{{aspectLabel(aspect.id)}}<small>{{settings.aspects[aspect.id].active ? (locale === 'it' ? 'Attivo' : 'Enabled') : (locale === 'it' ? 'Disattivato' : 'Disabled')}}</small></span><span aria-hidden="true">›</span></button>
        }
        }
      } @else {
        @if (selectedPoint; as selected) {
          <button type="button" (click)="selectedPoint = null">← {{locale === 'it' ? 'Punti celesti' : 'Celestial points'}}</button>
          <h2><img class="celestial-glyph" [src]="pointGlyph(selected)" [alt]="pointLabel(selected, locale)"></h2>
          <label class="check"><input type="checkbox" [checked]="settings.points[selected].shown" (change)="setPoint(selected, 'shown', $any($event.target).checked)"> {{locale === 'it' ? 'Mostra' : 'Show'}}</label>
          <label class="check"><input type="checkbox" [checked]="settings.points[selected].aspects" (change)="setPoint(selected, 'aspects', $any($event.target).checked)"> {{locale === 'it' ? 'Aspetti' : 'Aspects'}}</label>
          <label>{{locale === 'it' ? 'Orbita' : 'Orb'}} <input class="orb" type="text" inputmode="decimal" maxlength="4" [value]="settings.points[selected].orb" (change)="setPointOrb(selected, $any($event.target))"></label>
        } @else {
        @for (point of points; track point) {
          <button class="option" type="button" [attr.aria-label]="pointLabel(point, locale)" (click)="selectedPoint = point"><span><img class="celestial-glyph" [src]="pointGlyph(point)" alt=""><small>{{settings.points[point].shown ? (locale === 'it' ? 'Visibile' : 'Visible') : (locale === 'it' ? 'Nascosto' : 'Hidden')}}</small></span><span aria-hidden="true">›</span></button>
        }
        }
      }
    </section>`,
  styles: [`.settings{border:1px solid var(--border,#39465d);border-radius:18px;background:var(--card,#ffffff09);padding:16px;margin:12px 0;color:var(--text,#f7f4f0)} h2{font-size:20px;margin:18px 0} p{font-size:13px;color:var(--muted,#afb7c9)} .option{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--border,#39465d);border-radius:0;padding:14px 4px}.option small{display:block;color:var(--muted,#afb7c9);margin-top:4px}.check{display:flex;align-items:center;gap:9px;margin:18px 0} input[type=checkbox]{width:22px;height:22px}.orb{box-sizing:border-box;width:80px;padding:10px;color:var(--text,#fff);background:var(--surface,#151d30);border:1px solid var(--border,#57617b);border-radius:8px} button{min-height:44px;padding:10px;color:var(--text,#fff);background:var(--control,#253049);border:1px solid var(--border,#57617b);border-radius:9px}.celestial-glyph{width:30px;height:26px;object-fit:contain;vertical-align:middle}:host-context([data-theme='light']) .celestial-glyph{filter:brightness(0)}`]
})
export class ChartSettingsComponent {
  readonly pointLabel = pointLabel;
  readonly pointGlyph = pointGlyph;
  @Input({required:true}) settings!: ChartSettings;
  @Input() locale: 'it'|'en' = 'it';
  @Input() section: 'aspects'|'points' = 'aspects';
  @Output() readonly settingsChange = new EventEmitter<ChartSettings>();
  readonly aspects = ASPECT_DEFINITIONS;
  readonly points = POINT_IDS;
  selectedAspect:AspectId|null=null;
  selectedPoint:PointId|null=null;
  invalidOrb = false;
  aspectLabel(id: AspectId): string {return aspectLabel(id, this.locale);}
  private edit(change: (settings: ChartSettings) => void): void {
    const next = sanitizeChartSettings(this.settings);
    change(next);
    this.invalidOrb = false;
    this.settingsChange.emit(next);
  }
  setVisible(value: boolean): void { this.edit(s => {s.showAspects = value;}); }
  setAspect(id: AspectId, value: boolean): void { this.edit(s => {s.aspects[id].active = value;}); }
  setPoint(id: PointId, field: 'shown'|'aspects', value: boolean): void { this.edit(s => {s.points[id][field] = value;}); }
  setAspectOrb(id: AspectId, input: HTMLInputElement): void {
    const value = parseOrb(input.value, 0.1);
    if (value === undefined) {this.invalidOrb = true; input.value = String(this.settings.aspects[id].orb ?? ''); return;}
    this.edit(s => {s.aspects[id].orb = value;});
  }
  setPointOrb(id: PointId, input: HTMLInputElement): void {
    const value = parseOrb(input.value, 0);
    if (value === undefined || value === null) {this.invalidOrb = true; input.value = String(this.settings.points[id].orb); return;}
    this.edit(s => {s.points[id].orb = value;});
  }
  reset(): void {this.invalidOrb = false; this.settingsChange.emit(defaultChartSettings());}
}
