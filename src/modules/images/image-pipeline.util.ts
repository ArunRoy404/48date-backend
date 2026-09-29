import sharp from 'sharp';
import crypto from 'crypto';

/**
 * The optimized rendition actually stored and served.
 *
 * Rules the dating-app use case dictates:
 * - JPEG/PNG/WEBP inputs become WEBP — 25-50% smaller than JPEG at the same
 *   visual quality, universally supported by Flutter and browsers.
 * - GIF stays GIF: sharp animates only with explicit page handling, and
 *   profile photos don't need to be animated — re-encoding an animated GIF
 *   would flatten it to its first frame, so pass it through untouched.
 * - 1600px is the long-edge ceiling (profile photos are never rendered
 *   larger); `withoutEnlargement` keeps small originals small.
 * - EXIF is stripped (privacy: GPS coordinates must not survive upload) and
 *   orientation is baked into the pixels so phones' sideways JPEGs render
 *   upright everywhere.
 */
export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  hash: string;
  mimeType: 'image/webp' | 'image/gif';
  extension: 'webp' | 'gif';
}

const MAX_LONG_EDGE = 1600;

export async function processImage(original: Buffer): Promise<ProcessedImage> {
  const image = sharp(original, { failOn: 'error' });
  const meta = await image.metadata();

  if (meta.format === 'gif') {
    const output = await image.toBuffer();
    return {
      buffer: output,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      bytes: output.length,
      hash: sha256(output),
      mimeType: 'image/gif',
      extension: 'gif',
    };
  }

  const output = await image
    .rotate() // bake EXIF orientation into pixels before stripping the metadata
    .resize({
      width: MAX_LONG_EDGE,
      height: MAX_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
    bytes: output.data.length,
    hash: sha256(output.data),
    mimeType: 'image/webp',
    extension: 'webp',
  };
}

/** Hash of the *processed* bytes — identical sources must produce identical renditions. */
export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
