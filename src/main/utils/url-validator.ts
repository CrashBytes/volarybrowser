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

const SEARCH_ENGINES: Record<string, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
  searxng: 'https://searx.be/search?q=',
};

let currentSearchEngine = 'duckduckgo';

/**
 * Set the search engine used for search queries
 */
export function setSearchEngine(engine: string): void {
  if (SEARCH_ENGINES[engine]) {
    currentSearchEngine = engine;
  }
}

function getSearchUrl(): string {
  return SEARCH_ENGINES[currentSearchEngine] || SEARCH_ENGINES.duckduckgo;
}

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
    // Don't upgrade local/private network addresses to HTTPS
    if (isLocalUrl(trimmed)) {
      return { url: trimmed, isSearch: false, wasUpgraded: false };
    }
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
    url: `${getSearchUrl()}${encodeURIComponent(trimmed)}`,
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
 * Check if a URL points to a local or private network address
 */
function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    // Private IPv4 ranges
    if (/^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    // .local domains
    if (host.endsWith('.local')) return true;
    return false;
  } catch {
    return false;
  }
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
