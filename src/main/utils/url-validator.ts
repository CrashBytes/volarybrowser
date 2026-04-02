/**
 * URL Validation and Normalization
 *
 * Validates user input, normalizes URLs, detects search queries,
 * and enforces HTTPS upgrade where possible.
 *
 * @module utils/url-validator
 */

/** Result of URL validation/normalization */
export interface ValidatedUrl {
  /** The normalized URL ready to load */
  url: string;
  /** Whether this was detected as a search query */
  isSearch: boolean;
  /** Whether HTTPS was enforced/upgraded */
  wasUpgraded: boolean;
}

const INTERNAL_SCHEMES = ['about:', 'chrome:', 'volary:', 'devtools:', 'data:', 'blob:'];
const SEARCH_ENGINE_URL = 'https://duckduckgo.com/?q=';

/**
 * Validate and normalize a user-entered string into a loadable URL
 */
export function validateAndNormalizeUrl(input: string): ValidatedUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    return { url: 'about:blank', isSearch: false, wasUpgraded: false };
  }

  // Internal schemes pass through
  for (const scheme of INTERNAL_SCHEMES) {
    if (trimmed.toLowerCase().startsWith(scheme)) {
      return { url: trimmed, isSearch: false, wasUpgraded: false };
    }
  }

  // Already has a scheme — upgrade HTTP to HTTPS
  if (/^https:\/\//i.test(trimmed)) {
    return { url: trimmed, isSearch: false, wasUpgraded: false };
  }
  if (/^http:\/\//i.test(trimmed)) {
    const upgraded = trimmed.replace(/^http:/i, 'https:');
    return { url: upgraded, isSearch: false, wasUpgraded: true };
  }

  // Looks like a URL (has a dot, no spaces, valid-ish structure)
  if (looksLikeUrl(trimmed)) {
    // Upgrade to HTTPS by default
    return { url: `https://${trimmed}`, isSearch: false, wasUpgraded: true };
  }

  // Treat as search query
  return {
    url: `${SEARCH_ENGINE_URL}${encodeURIComponent(trimmed)}`,
    isSearch: true,
    wasUpgraded: false,
  };
}

/**
 * Check if input looks like a URL (not a search query)
 *
 * Heuristics:
 * - Contains a dot and no spaces
 * - Or is localhost / an IP address
 * - Or has a port number
 */
function looksLikeUrl(input: string): boolean {
  // No spaces allowed in URLs
  if (input.includes(' ')) return false;

  // localhost or localhost:port
  if (/^localhost(:\d+)?(\/|$)/i.test(input)) return true;

  // IP address (v4)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/.test(input)) return true;

  // Has a dot and looks domain-like
  if (input.includes('.') && /^[a-zA-Z0-9]/.test(input)) return true;

  return false;
}

/**
 * Check if a URL is using HTTPS
 */
export function isSecureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract a display-friendly version of a URL
 */
export function getDisplayUrl(url: string): string {
  if (!url || url === 'about:blank') return '';
  try {
    const parsed = new URL(url);
    // Remove trailing slash for cleaner display
    let display = parsed.host + parsed.pathname;
    if (display.endsWith('/')) display = display.slice(0, -1);
    if (parsed.search) display += parsed.search;
    return display;
  } catch {
    return url;
  }
}
