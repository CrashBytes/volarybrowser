/**
 * Translation helpers - pure functions
 *
 * Everything here is free of Electron so it can be unit tested in Node.
 *
 * @module translation/language
 */

export { normalizeLang, sameLanguage, languageName } from '../../shared/translation';

/** Default request size limits for a translation batch */
export const BATCH_MAX_CHARS = 4000;
export const BATCH_MAX_ITEMS = 100;

/**
 * Split segment texts into batches of indices, each batch at most
 * `maxChars` characters and `maxItems` items. A single segment longer
 * than `maxChars` becomes a batch of its own.
 */
export function chunkSegments(
  texts: readonly string[],
  maxChars: number = BATCH_MAX_CHARS,
  maxItems: number = BATCH_MAX_ITEMS,
): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let currentChars = 0;

  for (let i = 0; i < texts.length; i++) {
    const len = (texts[i] ?? '').length;
    const wouldOverflow = current.length > 0
      && (currentChars + len > maxChars || current.length >= maxItems);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(i);
    currentChars += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export interface BatchResult {
  translations: string[];
  /** Language the provider detected for the batch, when it reports one */
  detected: string | null;
}

/**
 * Parse the response of Google's `translate_a/t` endpoint.
 *
 * With `sl=auto` the body is `[[translated, detectedLang], ...]`;
 * with an explicit source it is `[translated, ...]`. A single-segment
 * request may come back as a bare string.
 */
export function parseGoogleBatch(body: unknown, expected: number): BatchResult {
  const translations: string[] = [];
  const langs: string[] = [];

  const pushItem = (item: unknown): void => {
    if (typeof item === 'string') {
      translations.push(item);
    } else if (Array.isArray(item) && typeof item[0] === 'string') {
      translations.push(item[0]);
      if (typeof item[1] === 'string') langs.push(item[1]);
    } else {
      translations.push('');
    }
  };

  if (typeof body === 'string') {
    pushItem(body);
  } else if (Array.isArray(body)) {
    // A single auto-detected segment is `[translated, lang]`, not `[[translated, lang]]`
    const isSinglePair = expected === 1
      && body.length === 2
      && typeof body[0] === 'string'
      && typeof body[1] === 'string'
      && body[1].length <= 7;
    if (isSinglePair) {
      pushItem(body);
    } else {
      for (const item of body) pushItem(item);
    }
  }

  if (translations.length !== expected) {
    throw new Error(`Translation count mismatch: expected ${expected}, got ${translations.length}`);
  }

  return { translations, detected: majority(langs) };
}

/**
 * Parse a LibreTranslate `/translate` response.
 *
 * `{ translatedText: string | string[], detectedLanguage?: {language} | {language}[] }`
 */
export function parseLibreBatch(body: unknown, expected: number): BatchResult {
  if (!body || typeof body !== 'object') {
    throw new Error('LibreTranslate returned an unexpected response');
  }
  const obj = body as { translatedText?: unknown; detectedLanguage?: unknown; error?: unknown };
  if (typeof obj.error === 'string') {
    throw new Error(`LibreTranslate: ${obj.error}`);
  }

  let translations: string[];
  if (typeof obj.translatedText === 'string') {
    translations = [obj.translatedText];
  } else if (Array.isArray(obj.translatedText)) {
    translations = obj.translatedText.map(t => (typeof t === 'string' ? t : ''));
  } else {
    throw new Error('LibreTranslate response has no translatedText');
  }

  if (translations.length !== expected) {
    throw new Error(`Translation count mismatch: expected ${expected}, got ${translations.length}`);
  }

  const langs: string[] = [];
  const det = obj.detectedLanguage;
  const collect = (d: unknown): void => {
    if (d && typeof d === 'object' && typeof (d as { language?: unknown }).language === 'string') {
      langs.push((d as { language: string }).language);
    }
  };
  if (Array.isArray(det)) det.forEach(collect); else collect(det);

  return { translations, detected: majority(langs) };
}

/** Most frequent entry, or null for an empty list */
export function majority(values: readonly string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

/** Only real web pages are translated; internal and local schemes are left alone */
export function isTranslatableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Lower-cased hostname of a URL, or null when it cannot be parsed */
export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/**
 * True when `host` equals an entry in `list` or is a subdomain of one.
 * Entries are compared case-insensitively; a leading "www." on either side is ignored.
 */
export function hostMatches(host: string | null, list: readonly string[]): boolean {
  if (!host) return false;
  const h = stripWww(host.toLowerCase());
  for (const raw of list) {
    const entry = stripWww(String(raw).trim().toLowerCase());
    if (!entry) continue;
    if (h === entry || h.endsWith('.' + entry)) return true;
  }
  return false;
}

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** A segment worth sending to the translator: contains at least one letter */
export function isMeaningfulText(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /\p{L}/u.test(trimmed);
}

/**
 * Re-apply the leading and trailing whitespace of `original` to `translated`
 * so inline text keeps its spacing around sibling elements.
 */
export function preserveEdges(original: string, translated: string): string {
  const lead = /^\s*/.exec(original)?.[0] ?? '';
  const trail = /\s*$/.exec(original)?.[0] ?? '';
  return lead + translated.trim() + trail;
}
