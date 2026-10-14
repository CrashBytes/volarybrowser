import { describe, it, expect } from 'vitest';
import { matchesElement } from '../../../src/main/media/mp4-info';

describe('matchesElement', () => {
  const info = { duration: 15.5, width: 576, height: 1024 };

  it('matches on duration within half a second and equal dimensions', () => {
    expect(matchesElement(info, { duration: 15.47, width: 576, height: 1024 })).toBe(true);
    expect(matchesElement(info, { duration: 16.2, width: 576, height: 1024 })).toBe(false);
    expect(matchesElement(info, { duration: 15.5, width: 720, height: 1280 })).toBe(false);
  });

  it('ignores dimensions the element does not report', () => {
    expect(matchesElement(info, { duration: 15.5, width: 0, height: 0 })).toBe(true);
  });

  it('never matches without a finite element duration', () => {
    expect(matchesElement(info, { duration: Number.NaN, width: 576, height: 1024 })).toBe(false);
    expect(matchesElement(info, { duration: Infinity, width: 576, height: 1024 })).toBe(false);
  });
});
