import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SkyChart } from './current-sky.models';

const SIGNS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const GLYPHS: Record<string, string> = {
  sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂',
  jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇'
};

interface WheelPoint { x: number; y: number; }
interface PlanetMarker extends WheelPoint { id: string; glyph: string; longitude: number; }

@Component({
  selector: 'app-sky-wheel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wheel-panel" aria-label="Tropical zodiac wheel">
      <svg viewBox="0 0 400 400" role="img" aria-label="Planetary ecliptic longitudes in the tropical zodiac">
        <circle cx="200" cy="200" r="188" fill="none" stroke="#c7a76d" stroke-width="2"/>
        <circle cx="200" cy="200" r="151" fill="none" stroke="#53647e"/>
        <circle cx="200" cy="200" r="107" fill="none" stroke="#53647e"/>
        @for (sign of signs; track $index) {
          <line [attr.x1]="point($index * 30, 151).x" [attr.y1]="point($index * 30, 151).y"
                [attr.x2]="point($index * 30, 188).x" [attr.y2]="point($index * 30, 188).y"
                stroke="#53647e"/>
          <text [attr.x]="point($index * 30 + 15, 169).x"
                [attr.y]="point($index * 30 + 15, 169).y"
                dominant-baseline="middle" text-anchor="middle" fill="#e8c486" font-size="22">{{ sign }}</text>
        }
        @for (marker of markers(); track marker.id) {
          <line [attr.x1]="point(marker.longitude, 107).x" [attr.y1]="point(marker.longitude, 107).y"
                [attr.x2]="point(marker.longitude, 148).x" [attr.y2]="point(marker.longitude, 148).y"
                stroke="#c7a76d" stroke-width="1"/>
          <circle [attr.cx]="marker.x" [attr.cy]="marker.y" r="13" fill="#18243a" stroke="#c7a76d"/>
          <text [attr.x]="marker.x" [attr.y]="marker.y" dominant-baseline="middle"
                text-anchor="middle" fill="#f5e4c7" font-size="19">{{ marker.glyph }}</text>
        }
        <text x="200" y="192" text-anchor="middle" fill="#e8c486" font-size="13">VirgoStars</text>
        <text x="200" y="213" text-anchor="middle" fill="#aebad0" font-size="10">TROPICAL · 0° ARIES AT TOP</text>
      </svg>
      <div class="planet-list">
        @for (marker of markers(); track marker.id) {
          <span><b>{{ marker.glyph }}</b> {{ marker.id }} {{ marker.longitude.toFixed(2) }}°</span>
        }
      </div>
    </section>
  `,
  styles: [`
    .wheel-panel { border: 1px solid #39465d; border-radius: 22px; padding: 12px; background: #ffffff09; }
    svg { display: block; width: 100%; height: auto; }
    .planet-list { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; padding: 8px; }
    .planet-list span { color: #d8ddea; font-size: 12px; text-transform: capitalize; }
    .planet-list b { color: #e8c486; font-size: 18px; margin-right: 4px; }
  `]
})
export class SkyWheelComponent {
  readonly chart = input.required<SkyChart>();
  readonly signs = SIGNS;

  point(longitude: number, radius: number): WheelPoint {
    // Aries 0° at 12 o'clock; increasing longitude runs counterclockwise.
    const radians = (longitude - 90) * Math.PI / 180;
    return { x: 200 - radius * Math.cos(radians + Math.PI / 2), y: 200 - radius * Math.sin(radians + Math.PI / 2) };
  }

  markers(): PlanetMarker[] {
    return this.chart().bodies.map(body => ({
      ...this.point(body.longitude, 122),
      id: body.id,
      glyph: GLYPHS[body.id],
      longitude: body.longitude
    }));
  }
}
