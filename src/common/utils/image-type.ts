/**
 * Content-based image type detection for uploads.
 *
 * The declared `Content-Type` on a multipart part is client-controlled and
 * proves nothing — a renamed `.html` or `.js` payload announces itself as
 * `image/png`. The storage layer therefore trusts the file's magic bytes and
 * treats the declared type as a hint only.
 *
 * Kept dependency-free deliberately: the four supported formats have short,
 * stable signatures, and a sniffing library would be one more dependency for
 * ~30 lines of trivial code. If formats beyond JPEG/PNG/WEBP/GIF are ever
 * admitted, reach for `file-type` instead of growing this file.
 */

export type DetectedImageType = 'jpeg' | 'png' | 'webp' | 'gif';

/** Canonical extension and MIME type per detected format. */
const FORMAT_INFO: Record<
  DetectedImageType,
  { extension: string; mimeType: string }
> = {
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg' },
  png: { extension: 'png', mimeType: 'image/png' },
  webp: { extension: 'webp', mimeType: 'image/webp' },
  gif: { extension: 'gif', mimeType: 'image/gif' },
};

export interface DetectedImageFormat {
  type: DetectedImageType;
  extension: string;
  mimeType: string;
}

/**
 * JPEG: starts with the two-byte SOI marker FFD8 (the third byte varies by
 * JFIF/EXIF variant, so only the prefix is checked).
 */
function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * PNG: fixed 8-byte signature 89 50 4E 47 0D 0A 1A 0A
 * (µPNG + "PNG\r\n\x1a\n").
 */
function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

/** GIF: ASCII "GIF87a" or "GIF89a" — the two standard versions. */
function isGif(bytes: Uint8Array): boolean {
  const header = String.fromCharCode(...bytes.subarray(0, 6));
  return header === 'GIF87a' || header === 'GIF89a';
}

/**
 * WEBP: "RIFF" at offset 0 and "WEBP" at offset 8. RIFF alone is not enough —
 * it is a container family (WAV, AVI…) — so both markers are required.
 */
function isWebp(bytes: Uint8Array): boolean {
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  return riff === 'RIFF' && webp === 'WEBP';
}

/**
 * Sniffs the actual image format from magic bytes.
 * Returns null when the content matches none of the supported formats.
 */
export function detectImageFormat(
  buffer: Uint8Array,
): DetectedImageFormat | null {
  // Every signature checked here fits in 12 bytes; shorter buffers cannot
  // match and are rejected without further work.
  if (!buffer || buffer.length < 12) {
    return null;
  }

  if (isJpeg(buffer)) return { type: 'jpeg', ...FORMAT_INFO.jpeg };
  if (isPng(buffer)) return { type: 'png', ...FORMAT_INFO.png };
  if (isWebp(buffer)) return { type: 'webp', ...FORMAT_INFO.webp };
  if (isGif(buffer)) return { type: 'gif', ...FORMAT_INFO.gif };
  return null;
}
