/**
 * Request a browser download for an already validated synthetic PNG data URL.
 * Never infer save success: a completed click is only a browser request.
 * The caller must validate the full PNG payload; this final boundary independently
 * rejects non-PNG URL schemes, oversized URLs and unexpected filenames.
 */
export interface SyntheticPngAnchor {
  href: string;
  download: string;
  click(): void;
  remove(): void;
}

// Keep the concrete anchor type across the port boundary: the browser uses
// HTMLAnchorElement (a DOM Node), while unit tests can supply a minimal stub.
export interface SyntheticPngDownloadPort<TAnchor extends SyntheticPngAnchor = SyntheticPngAnchor> {
  createAnchor(): TAnchor;
  appendAnchor(anchor: TAnchor): void;
}

const PNG_PREFIX = 'data:image/png;base64,';
const MAX_PNG_BASE64_LENGTH = 32 * 1024 * 1024;
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
const SYNTHETIC_FILENAMES = new Set(
  ['natal', 'transits', 'synastry', 'latitude'].flatMap(mode =>
    ['light', 'dark'].flatMap(theme => ['synthetic', 'chart'].map(kind => `virgostars-${kind}-${mode}-${theme}.png`))),
);

/** Defense in depth: reject dangerous input before creating an anchor. */
function assertSafeDownloadTarget(url: unknown, filename: unknown): asserts url is string {
  if (typeof url !== 'string' || !url.startsWith(PNG_PREFIX) ||
      typeof filename !== 'string' || !SYNTHETIC_FILENAMES.has(filename)) {
    throw new Error('Invalid PNG download');
  }
  // Reject oversize inputs before copying a potentially huge encoded payload.
  const encodedLength = url.length - PNG_PREFIX.length;
  if (encodedLength < 64 || encodedLength > MAX_PNG_BASE64_LENGTH ||
      encodedLength % 4 !== 0) {
    throw new Error('Invalid PNG download');
  }
  const body = url.slice(PNG_PREFIX.length);
  if (!BASE64_BODY.test(body)) throw new Error('Invalid PNG download');
  // Nonzero unused padding bits allow multiple strings for the same PNG bytes.
  // Accept only canonical RFC 4648 Base64, without decoding or duplicating the PNG.
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  if (padding !== 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const finalSextet = alphabet.indexOf(body.charAt(body.length - padding - 1));
    if (finalSextet < 0 || (finalSextet & (padding === 2 ? 15 : 3)) !== 0) {
      throw new Error('Invalid PNG download');
    }
  }
  // A future caller might skip the upstream IHDR/CRC validator. Reject an
  // obviously non-PNG payload before allocating any DOM anchor. Decode only
  // 24 Base64 characters (18 bytes), never the complete image in this guard.
  try {
    const header = atob(body.slice(0, 24));
    if (!header.startsWith('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR')) {
      throw new Error('Invalid PNG download');
    }
  } catch {
    throw new Error('Invalid PNG download');
  }
}

export function requestSyntheticPngDownload<TAnchor extends SyntheticPngAnchor>(
  validatedDataUrl: string,
  validatedFilename: string,
  port: SyntheticPngDownloadPort<TAnchor>,
): void {
  assertSafeDownloadTarget(validatedDataUrl, validatedFilename);
  const anchor = port.createAnchor();
  let operationFailed = false;
  try {
    anchor.href = validatedDataUrl;
    anchor.download = validatedFilename;
    // Attach before clicking to support download behavior in embedded WebViews.
    port.appendAnchor(anchor);
    anchor.click();
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    // A faulty WebView cleanup must not replace the original download error.
    // A standalone cleanup failure is still reported to the caller.
    try {
      anchor.remove();
    } catch (cleanupError) {
      if (!operationFailed) throw cleanupError;
    }
  }
}
