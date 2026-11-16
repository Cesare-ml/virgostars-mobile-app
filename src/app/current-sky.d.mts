export interface ZodiacSign { id: string; glyph: string; it: string; en: string; }
export interface PlanetPosition {
  id: string; glyph: string; nameIt: string; nameEn: string; longitude: number;
  signIndex: number; signIt: string; signEn: string; signGlyph: string;
  degree: number; minute: number; x: number; y: number;
}
export interface CurrentSky {
  instant: string; provider: string; referenceFrame: string; planets: PlanetPosition[];
}
export function calculateCurrentSky(instant?: Date | string | number): CurrentSky;
export const ZODIAC_SIGNS: ZodiacSign[];
