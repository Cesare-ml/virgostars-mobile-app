/**
 * Validate the renderer's PNG data URL before giving it to a download anchor.
 * This is a transport/format guard, not a decoder or proof of PNG integrity.
 * No external URLs, SVG/HTML payloads, arbitrary filenames or user data belong here.
 */
import type {ChartMode} from './astro/chart-wheel.component';
type UiTheme = 'light' | 'dark';

export const MAX_PNG_DATA_URL_BASE64_LENGTH = 32 * 1024 * 1024;
const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PNG_DIMENSION = 16384;
const PNG_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
// PNG permits only these bit depths for each IHDR color type.
const IHDR_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8],
  4: [8, 16], 6: [8, 16],
};

function u32(bytes: string, offset: number): number {
  return bytes.charCodeAt(offset) * 16777216 +
    bytes.charCodeAt(offset + 1) * 65536 +
    bytes.charCodeAt(offset + 2) * 256 +
    bytes.charCodeAt(offset + 3);
}

/** CRC covers only the fixed 17-byte IHDR type + data, never the full image. */
function ihdrCrc32(bytes: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes.charCodeAt(i);
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Return the unchanged safe URL; reject everything except bounded, PNG-shaped data. */
export function validatePngDataUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) {
    throw new Error('Invalid PNG export');
  }
  const body = value.slice(PNG_PREFIX.length);
  if (body.length < 64 || body.length > MAX_PNG_DATA_URL_BASE64_LENGTH ||
      body.length % 4 !== 0 || !PNG_BASE64.test(body)) {
    throw new Error('Invalid PNG export');
  }
  let header: string;
  try {
    // Exactly the first 33 bytes: the PNG signature and complete IHDR chunk.
    // Never decode a potentially huge image into a second in-memory buffer.
    header = atob(body.slice(0, 44));
  } catch {
    throw new Error('Invalid PNG export');
  }
  if (header.length !== 33 ||
      PNG_SIGNATURE.some((byte, index) => header.charCodeAt(index) !== byte) ||
      u32(header, 8) !== 13 || header.slice(12, 16) !== 'IHDR') {
    throw new Error('Invalid PNG export');
  }
  const width = u32(header, 16);
  const height = u32(header, 20);
  if (width < 1 || height < 1 || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION) {
    throw new Error('Invalid PNG export');
  }
  const bitDepth = header.charCodeAt(24);
  const colorType = header.charCodeAt(25);
  const compression = header.charCodeAt(26);
  const filter = header.charCodeAt(27);
  const interlace = header.charCodeAt(28);
  if (!IHDR_DEPTHS[colorType]?.includes(bitDepth) ||
      compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1) ||
      ihdrCrc32(header.slice(12, 29)) !== u32(header, 29)) {
    throw new Error('Invalid PNG export');
  }
  return value;
}

/** Calculated charts get their own name so a fixture export is never mistaken for one. */
export function calculatedPngFilename(mode: ChartMode, theme: UiTheme): string {
  return syntheticPngFilename(mode, theme).replace('virgostars-synthetic-', 'virgostars-chart-');
}

/** Fixture data only; never label it as a real chart. */
export function syntheticPngFilename(mode: ChartMode, theme: UiTheme): string {
  const modes: readonly string[] = ['natal', 'transits', 'synastry', 'latitude'];
  if (!modes.includes(mode) || (theme !== 'light' && theme !== 'dark')) {
    throw new Error('Invalid PNG export');
  }
  return `virgostars-synthetic-${mode}-${theme}.png`;
}
