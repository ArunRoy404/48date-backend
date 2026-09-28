import { detectImageFormat } from './image-type.js';

/** Builds a buffer from a hex string — keeps signatures readable. */
const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

describe('detectImageFormat', () => {
  it('detects JPEG by its SOI marker', () => {
    // FFD8 FF E0 (JFIF APP0) + padding
    const buffer = fromHex('ffd8ffe000104a46494600010100000100010000');
    expect(detectImageFormat(buffer)).toMatchObject({
      type: 'jpeg',
      extension: 'jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('detects PNG by its 8-byte signature', () => {
    const buffer = fromHex('89504e470d0a1a0a0000000d49484452');
    expect(detectImageFormat(buffer)).toMatchObject({
      type: 'png',
      extension: 'png',
      mimeType: 'image/png',
    });
  });

  it('detects WEBP via RIFF container + WEBP marker', () => {
    const buffer = fromHex('524946460a000000574542505650384c');
    expect(detectImageFormat(buffer)).toMatchObject({
      type: 'webp',
      extension: 'webp',
      mimeType: 'image/webp',
    });
  });

  it('detects both GIF87a and GIF89a variants', () => {
    for (const version of ['GIF87a', 'GIF89a']) {
      const buffer = Uint8Array.from(
        [...version].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0, 0, 0]),
      );
      expect(detectImageFormat(buffer)).toMatchObject({
        type: 'gif',
        extension: 'gif',
        mimeType: 'image/gif',
      });
    }
  });

  it('rejects non-image content that claims to be an image (the XSS case)', () => {
    // "<html>" — a renamed HTML payload arriving as image/png
    const html = Uint8Array.from(
      [...'<html>'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0, 0, 0]),
    );
    expect(detectImageFormat(html)).toBeNull();
  });

  it('rejects a RIFF file that is not WEBP (WAV/AVI confusion)', () => {
    const wav = fromHex('524946460a00000057415645666d7420');
    expect(detectImageFormat(wav)).toBeNull();
  });

  it('rejects buffers too short to hold any known signature', () => {
    expect(detectImageFormat(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageFormat(new Uint8Array(0))).toBeNull();
  });
});
