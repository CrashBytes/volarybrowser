import { describe, it, expect } from 'vitest';
import { pickPageImages, summarizeBatch, MIN_IMAGE_DIMENSION } from '../../../src/main/media/page-images';

const img = (src: string, width = 800, height = 600) => ({ src, width, height });

describe('pickPageImages', () => {
  it('keeps http(s) and data: images and drops schemes main cannot fetch', () => {
    const result = pickPageImages([
      img('https://a.test/1.jpg'),
      img('http://a.test/2.png'),
      img('data:image/png;base64,AAAA'),
      img('blob:https://a.test/abc'),
      img('javascript:void(0)'),
      img('about:blank'),
      img(''),
    ], new Set());
    expect(result.images.map((i) => i.src)).toEqual([
      'https://a.test/1.jpg', 'http://a.test/2.png', 'data:image/png;base64,AAAA',
    ]);
    expect(result.skipped.unsupported).toBe(4);
  });

  it('saves each URL once even when the page repeats it', () => {
    const result = pickPageImages([
      img('https://a.test/1.jpg'), img('https://a.test/1.jpg'), img('https://a.test/2.jpg'),
    ], new Set());
    expect(result.images).toHaveLength(2);
    expect(result.skipped.duplicate).toBe(1);
  });

  it('skips images already in the vault by source URL', () => {
    const result = pickPageImages([
      img('https://a.test/1.jpg'), img('https://a.test/2.jpg'),
    ], new Set(['https://a.test/2.jpg']));
    expect(result.images.map((i) => i.src)).toEqual(['https://a.test/1.jpg']);
    expect(result.skipped.inVault).toBe(1);
  });

  it('skips icons and tracking pixels but keeps images of unknown size', () => {
    const small = MIN_IMAGE_DIMENSION - 1;
    const result = pickPageImages([
      img('https://a.test/pixel.gif', 1, 1),
      img('https://a.test/icon.png', small, 400),
      img('https://a.test/wide.png', 400, small),
      img('https://a.test/lazy.jpg', 0, 0),
      img('https://a.test/big.jpg', MIN_IMAGE_DIMENSION, MIN_IMAGE_DIMENSION),
    ], new Set());
    expect(result.images.map((i) => i.src)).toEqual(['https://a.test/lazy.jpg', 'https://a.test/big.jpg']);
    expect(result.skipped.tiny).toBe(3);
  });

  it('keeps the first occurrence in page order', () => {
    const result = pickPageImages([
      img('https://a.test/b.jpg'), img('https://a.test/a.jpg'), img('https://a.test/b.jpg'),
    ], new Set());
    expect(result.images.map((i) => i.src)).toEqual(['https://a.test/b.jpg', 'https://a.test/a.jpg']);
  });
});

describe('summarizeBatch', () => {
  const none = { unsupported: 0, duplicate: 0, inVault: 0, tiny: 0 };

  it('reports a plain count on full success', () => {
    expect(summarizeBatch({ saved: 12, failed: 0, skipped: none })).toBe('12 images saved to vault');
    expect(summarizeBatch({ saved: 1, failed: 0, skipped: none })).toBe('1 image saved to vault');
  });

  it('mentions images already in the vault and failures', () => {
    expect(summarizeBatch({ saved: 3, failed: 2, skipped: { ...none, inVault: 4 } }))
      .toBe('3 images saved to vault (4 already in vault, 2 failed)');
  });

  it('explains when nothing was saved', () => {
    expect(summarizeBatch({ saved: 0, failed: 0, skipped: { ...none, inVault: 5 } }))
      .toBe('No new images to save (5 already in vault)');
    expect(summarizeBatch({ saved: 0, failed: 0, skipped: none })).toBe('No images found on this page');
    expect(summarizeBatch({ saved: 0, failed: 3, skipped: none })).toBe('No images saved (3 failed)');
  });

  it('does not count tiny, duplicate or unsupported images as news', () => {
    expect(summarizeBatch({ saved: 2, failed: 0, skipped: { ...none, tiny: 9, duplicate: 3, unsupported: 1 } }))
      .toBe('2 images saved to vault');
  });
});
