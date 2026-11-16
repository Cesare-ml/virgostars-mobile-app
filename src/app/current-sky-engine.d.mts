export interface CurrentSkyBody {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly longitudeDeg: number;
  readonly latitudeDeg: number;
  readonly signIndex: number;
  readonly sign: string;
  readonly degreeInSign: number;
}

export interface CurrentSkySnapshot {
  readonly contract: 'VirgoStarsCurrentSky';
  readonly schemaVersion: 1;
  readonly datetimeUtc: string;
  readonly coordinateCenter: 'EARTH';
  readonly coordinateFrame: 'ECLIPTIC_OF_DATE';
  readonly positionType: 'APPARENT';
  readonly zodiac: 'TROPICAL';
  readonly engine: string;
  readonly refreshIntervalMs: number;
  readonly bodies: readonly CurrentSkyBody[];
}

export declare const CURRENT_SKY_ENGINE: string;
export declare const CURRENT_SKY_REFRESH_MS: number;
export declare const ZODIAC_SIGNS_IT: readonly string[];
export declare const ZODIAC_GLYPHS: readonly string[];
export declare function calculateCurrentSky(instant?: Date): Readonly<CurrentSkySnapshot>;
