import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import crypto from 'crypto';
import { processImage, sha256 } from './image-pipeline.util.js';

/** sharp-generated fixtures — no binary files committed to the repo. */
async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 80, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

describe('image pipeline (processImage)', () => {
  it('converts a JPEG-class input to WebP and reports metadata', async () => {
    const output = await processImage(await pngBuffer(800, 600));

    expect(output.mimeType).toBe('image/webp');
    expect(output.extension).toBe('webp');
    expect(output.width).toBe(800);
    expect(output.height).toBe(600);
    expect(output.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('downscales images whose long edge exceeds 1600px', async () => {
    const output = await processImage(await pngBuffer(3200, 1200));

    expect(output.width).toBe(1600);
    expect(output.height).toBe(600);
  });

  it('never enlarges a small image', async () => {
    const output = await processImage(await pngBuffer(64, 48));

    expect(output.width).toBe(64);
    expect(output.height).toBe(48);
  });

  it('strips EXIF (GPS must not survive upload) while baking orientation', async () => {
    // A JPEG tagged with EXIF orientation 6 (90° CW rotation needed).
    const withExif = await sharp({
      create: { width: 100, height: 200, channels: 3, background: '#123456' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const output = await processImage(withExif);
    const meta = await sharp(output.buffer).metadata();

    expect(meta.exif).toBeUndefined(); // metadata stripped
    // Orientation 6 baked in: portrait input becomes landscape pixels.
    expect(output.width).toBeGreaterThan(output.height);
  });

  it('passes GIFs through untouched (no flattened animation)', async () => {
    const gif = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#00ff00' },
    })
      .gif()
      .toBuffer();

    const output = await processImage(gif);

    expect(output.mimeType).toBe('image/gif');
    expect(output.extension).toBe('gif');
    expect(output.width).toBe(50);
  });

  it('hashes deterministically: identical input → identical hash', async () => {
    const a = await processImage(await pngBuffer(300, 300));
    const b = await processImage(await pngBuffer(300, 300));

    expect(a.hash).toBe(b.hash);
  });

  it('different images hash differently (no false dedup)', async () => {
    const a = await processImage(await pngBuffer(300, 300));
    const different = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 10, g: 200, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const b = await processImage(different);

    expect(a.hash).not.toBe(b.hash);
  });

  it('rejects non-image bytes', async () => {
    const garbage = Buffer.from('<html>definitely not an image</html>');
    await expect(processImage(garbage)).rejects.toThrow();
  });

  it('sha256 matches the sha256 of the same bytes', () => {
    const buf = Buffer.from('48date');
    expect(sha256(buf)).toBe(
      crypto.createHash('sha256').update(buf).digest('hex'),
    );
  });
});
