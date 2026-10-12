import { describe, it, expect } from 'vitest';
import { normalizeBookmarkUrl } from '../../../src/renderer/components/BookmarkManager/bookmark-url';

describe('normalizeBookmarkUrl', () => {
  it('adds https:// to a bare host', () => {
    expect(normalizeBookmarkUrl('example.com')).toBe('https://example.com/');
    expect(normalizeBookmarkUrl('  news.ycombinator.com/item?id=1 ')).toBe('https://news.ycombinator.com/item?id=1');
  });

  it('keeps http, https and about URLs', () => {
    expect(normalizeBookmarkUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x');
    expect(normalizeBookmarkUrl('https://a.test/p#h')).toBe('https://a.test/p#h');
    expect(normalizeBookmarkUrl('about:blank')).toBe('about:blank');
  });

  it('rejects script, file and data URLs and empty input', () => {
    expect(normalizeBookmarkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeBookmarkUrl('JavaScript:alert(1)')).toBeNull();
    expect(normalizeBookmarkUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeBookmarkUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(normalizeBookmarkUrl('   ')).toBeNull();
    expect(normalizeBookmarkUrl('https://')).toBeNull();
  });
});
