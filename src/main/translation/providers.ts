/**
 * Translation providers
 *
 * Each provider turns a batch of plain-text segments into translations.
 * Requests go out from the main process with Node's fetch: no cookies,
 * no referrer, nothing but the text and the language pair.
 *
 * @module translation/providers
 */

import { BatchResult, parseGoogleBatch, parseLibreBatch } from './language';
import type { TranslateProvider } from '../../shared/translation';

export interface TranslationBackend {
  readonly id: TranslateProvider;
  readonly label: string;
  /**
   * Translate `texts` from `source` ("auto" lets the provider detect)
   * into `target`. Must return exactly one translation per input.
   */
  translate(texts: readonly string[], source: string, target: string): Promise<BatchResult>;
}

export interface ProviderOptions {
  libreUrl?: string;
  libreApiKey?: string;
  /** Milliseconds before a request is abandoned */
  timeoutMs?: number;
  /** Injected for tests */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** A browser-like UA keeps the public endpoint from rejecting the request */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Google's code for Traditional Chinese */
function toGoogleCode(code: string): string {
  return code === 'zh-TW' ? 'zh-TW' : code === 'zh' ? 'zh-CN' : code;
}

/** LibreTranslate uses "zt" for Traditional Chinese */
function toLibreCode(code: string): string {
  return code === 'zh-TW' ? 'zt' : code;
}

export class GoogleTranslateBackend implements TranslationBackend {
  readonly id = 'google' as const;
  readonly label = 'Google Translate';
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async translate(texts: readonly string[], source: string, target: string): Promise<BatchResult> {
    if (texts.length === 0) return { translations: [], detected: null };

    const sl = source === 'auto' ? 'auto' : toGoogleCode(source);
    const url = `https://translate.googleapis.com/translate_a/t?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(toGoogleCode(target))}`;

    const body = new URLSearchParams();
    for (const t of texts) body.append('q', t);

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      body: body.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 429) {
      throw new Error('Google Translate is rate limiting requests. Try again in a minute.');
    }
    if (!response.ok) {
      throw new Error(`Google Translate returned HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    return parseGoogleBatch(json, texts.length);
  }
}

export class LibreTranslateBackend implements TranslationBackend {
  readonly id = 'libretranslate' as const;
  readonly label = 'LibreTranslate';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.baseUrl = (options.libreUrl || 'https://libretranslate.com').replace(/\/+$/, '');
    this.apiKey = options.libreApiKey ?? '';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async translate(texts: readonly string[], source: string, target: string): Promise<BatchResult> {
    if (texts.length === 0) return { translations: [], detected: null };

    const payload: Record<string, unknown> = {
      q: [...texts],
      source: source === 'auto' ? 'auto' : toLibreCode(source),
      target: toLibreCode(target),
      format: 'text',
    };
    if (this.apiKey) payload['api_key'] = this.apiKey;

    const response = await this.fetchImpl(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      /* fall through to the status check */
    }

    if (!response.ok) {
      const message = json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : `HTTP ${response.status}`;
      throw new Error(`LibreTranslate: ${message}`);
    }

    return parseLibreBatch(json, texts.length);
  }
}

export function createBackend(provider: TranslateProvider, options: ProviderOptions = {}): TranslationBackend {
  switch (provider) {
    case 'libretranslate':
      return new LibreTranslateBackend(options);
    case 'google':
    default:
      return new GoogleTranslateBackend(options);
  }
}
