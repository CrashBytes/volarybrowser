import { describe, it, expect } from 'vitest';
import { validateAndNormalizeUrl, isSecureUrl, getDisplayUrl } from '../../../src/main/utils/url-validator';

describe('validateAndNormalizeUrl', () => {
  it('should pass through empty input as about:blank', () => {
    const result = validateAndNormalizeUrl('');
    expect(result.url).toBe('about:blank');
    expect(result.isSearch).toBe(false);
  });

  it('should pass through https URLs', () => {
    const result = validateAndNormalizeUrl('https://example.com');
    expect(result.url).toBe('https://example.com');
    expect(result.isSearch).toBe(false);
    expect(result.wasUpgraded).toBe(false);
  });

  it('should upgrade http URLs to https', () => {
    const result = validateAndNormalizeUrl('http://example.com');
    expect(result.url).toBe('https://example.com');
    expect(result.wasUpgraded).toBe(true);
  });

  it('should pass through internal schemes', () => {
    expect(validateAndNormalizeUrl('about:blank').url).toBe('about:blank');
    expect(validateAndNormalizeUrl('chrome://settings').url).toBe('chrome://settings');
  });

  it('should add https:// to domain-like input', () => {
    const result = validateAndNormalizeUrl('example.com');
    expect(result.url).toBe('https://example.com');
    expect(result.wasUpgraded).toBe(true);
  });

  it('should add https:// to subdomain input', () => {
    const result = validateAndNormalizeUrl('www.example.com/page');
    expect(result.url).toBe('https://www.example.com/page');
    expect(result.wasUpgraded).toBe(true);
  });

  it('should handle localhost', () => {
    const result = validateAndNormalizeUrl('localhost:3000');
    expect(result.url).toBe('https://localhost:3000');
    expect(result.wasUpgraded).toBe(true);
  });

  it('should handle IP addresses', () => {
    const result = validateAndNormalizeUrl('192.168.1.1:8080');
    expect(result.url).toBe('https://192.168.1.1:8080');
    expect(result.wasUpgraded).toBe(true);
  });

  it('should treat text with spaces as search query', () => {
    const result = validateAndNormalizeUrl('how to code');
    expect(result.isSearch).toBe(true);
    expect(result.url).toContain('duckduckgo.com');
    expect(result.url).toContain('how%20to%20code');
  });

  it('should treat single word without dot as search', () => {
    const result = validateAndNormalizeUrl('testing');
    expect(result.isSearch).toBe(true);
  });

  it('should trim whitespace', () => {
    const result = validateAndNormalizeUrl('  example.com  ');
    expect(result.url).toBe('https://example.com');
  });
});

describe('isSecureUrl', () => {
  it('should detect HTTPS', () => {
    expect(isSecureUrl('https://example.com')).toBe(true);
  });

  it('should detect HTTP as insecure', () => {
    expect(isSecureUrl('http://example.com')).toBe(false);
  });

  it('should handle invalid URLs', () => {
    expect(isSecureUrl('not-a-url')).toBe(false);
  });
});

describe('getDisplayUrl', () => {
  it('should strip protocol and trailing slash', () => {
    expect(getDisplayUrl('https://example.com/')).toBe('example.com');
  });

  it('should keep path', () => {
    expect(getDisplayUrl('https://example.com/page')).toBe('example.com/page');
  });

  it('should return empty for about:blank', () => {
    expect(getDisplayUrl('about:blank')).toBe('');
  });
});
