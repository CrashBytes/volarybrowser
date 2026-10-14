/**
 * Translation - shared contracts
 *
 * Types and the language table used by both the main process
 * (TranslationManager) and the renderer (TranslateBar, Settings).
 * Must stay free of Node/Electron imports so the renderer bundle can use it.
 *
 * @module shared/translation
 */

/** How the browser reacts to a page that is not in the target language */
export type TranslateMode = 'off' | 'ask' | 'auto';

/** Who performs the translation */
export type TranslateProvider = 'google' | 'libretranslate';

/** Lifecycle of a translation on one tab */
export type TranslateStatus =
  | 'idle'        // nothing known / page in target language
  | 'offer'       // page detected in another language, waiting for the user
  | 'translating' // requests in flight
  | 'translated'  // page text replaced
  | 'dismissed'   // user closed the offer for this page load
  | 'error';      // last attempt failed, see `error`

export interface TranslateTabState {
  tabId: string;
  status: TranslateStatus;
  /** BCP-47 primary tag of the page, e.g. "de"; null when unknown */
  sourceLang: string | null;
  /** Language the page is (or would be) translated into */
  targetLang: string;
  /** Human readable name of sourceLang, when known */
  sourceName: string | null;
  targetName: string;
  /** Number of text segments replaced so far */
  segments: number;
  error: string | null;
}

/** Settings keys (all persisted through the settings repository) */
export const TRANSLATE_SETTINGS = {
  mode: 'translateMode',
  targetLang: 'translateTargetLang',
  provider: 'translateProvider',
  libreUrl: 'translateLibreUrl',
  libreApiKey: 'translateLibreApiKey',
  neverSites: 'translateNeverSites',
  alwaysLangs: 'translateAlwaysLangs',
  neverLangs: 'translateNeverLangs',
} as const;

export const TRANSLATE_DEFAULTS = {
  mode: 'off' as TranslateMode,
  targetLang: 'en',
  provider: 'google' as TranslateProvider,
  libreUrl: 'https://libretranslate.com',
  libreApiKey: '',
  neverSites: [] as string[],
  alwaysLangs: [] as string[],
  neverLangs: [] as string[],
};

/**
 * Languages offered as translation targets and recognised in detection.
 * Keys are the codes Google Translate and LibreTranslate accept.
 */
export const LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ru: 'Russian',
  uk: 'Ukrainian',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  tr: 'Turkish',
  el: 'Greek',
  he: 'Hebrew',
  ar: 'Arabic',
  fa: 'Persian',
  hi: 'Hindi',
  bn: 'Bengali',
  ur: 'Urdu',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  tl: 'Filipino',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  ro: 'Romanian',
  hu: 'Hungarian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sl: 'Slovenian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  ca: 'Catalan',
  ga: 'Irish',
  cy: 'Welsh',
  is: 'Icelandic',
  sw: 'Swahili',
  af: 'Afrikaans',
  la: 'Latin',
};

/** Codes offered in the target-language picker, English first then alphabetical by name */
export const TARGET_LANGUAGE_CODES: string[] = [
  'en',
  ...Object.keys(LANGUAGES)
    .filter(code => code !== 'en')
    .sort((a, b) => (LANGUAGES[a] ?? a).localeCompare(LANGUAGES[b] ?? b)),
];

/**
 * Normalise a language tag to the code used in LANGUAGES.
 *
 * "de-DE" -> "de", "zh-Hant"/"zh-TW" -> "zh-TW", "iw" -> "he",
 * "" / "und" / "auto" / garbage -> null
 */
export function normalizeLang(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim().toLowerCase().replace(/_/g, '-');
  if (!tag || tag === 'und' || tag === 'auto' || tag === 'x-default') return null;

  const parts = tag.split('-').filter(Boolean);
  const primary = parts[0] ?? '';
  if (!/^[a-z]{2,3}$/.test(primary)) return null;

  // Chinese needs the script/region to tell Simplified from Traditional
  if (primary === 'zh') {
    const rest = parts.slice(1);
    if (rest.some(p => p === 'hant' || p === 'tw' || p === 'hk' || p === 'mo')) return 'zh-TW';
    return 'zh';
  }

  // Legacy / alias codes
  const aliases: Record<string, string> = {
    iw: 'he',  // Hebrew (old ISO code)
    in: 'id',  // Indonesian (old ISO code)
    ji: 'yi',  // Yiddish
    jw: 'jv',  // Javanese
    nb: 'no',  // Norwegian Bokmal
    nn: 'no',  // Norwegian Nynorsk
    mo: 'ro',  // Moldavian -> Romanian
    fil: 'tl', // Filipino
  };
  return aliases[primary] ?? primary;
}

/** True when both tags name the same language after normalisation */
export function sameLanguage(a: unknown, b: unknown): boolean {
  const na = normalizeLang(a);
  const nb = normalizeLang(b);
  return na !== null && na === nb;
}

/** Human readable name for a code; falls back to the upper-cased code */
export function languageName(code: string | null | undefined): string | null {
  if (!code) return null;
  const norm = normalizeLang(code);
  if (!norm) return null;
  return LANGUAGES[norm] ?? norm.toUpperCase();
}
