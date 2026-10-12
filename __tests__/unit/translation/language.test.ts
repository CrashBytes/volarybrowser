import { describe, it, expect, vi } from 'vitest';
import {
  normalizeLang,
  sameLanguage,
  languageName,
  LANGUAGES,
  TARGET_LANGUAGE_CODES,
} from '../../../src/shared/translation';
import {
  chunkSegments,
  parseGoogleBatch,
  parseLibreBatch,
  majority,
  isTranslatableUrl,
  hostFromUrl,
  hostMatches,
  isMeaningfulText,
  preserveEdges,
} from '../../../src/main/translation/language';
import { GoogleTranslateBackend, LibreTranslateBackend, createBackend } from '../../../src/main/translation/providers';
import { buildApplyScript, COLLECT_SCRIPT, DETECT_SCRIPT, RESTORE_SCRIPT } from '../../../src/main/translation/page-scripts';

describe('normalizeLang', () => {
  it('reduces region tags to the primary language', () => {
    expect(normalizeLang('de-DE')).toBe('de');
    expect(normalizeLang('en_US')).toBe('en');
    expect(normalizeLang('  FR ')).toBe('fr');
  });

  it('keeps Traditional Chinese distinct', () => {
    expect(normalizeLang('zh-TW')).toBe('zh-TW');
    expect(normalizeLang('zh-Hant-HK')).toBe('zh-TW');
    expect(normalizeLang('zh-CN')).toBe('zh');
    expect(normalizeLang('zh-Hans')).toBe('zh');
    expect(normalizeLang('zh')).toBe('zh');
  });

  it('maps legacy codes', () => {
    expect(normalizeLang('iw')).toBe('he');
    expect(normalizeLang('in')).toBe('id');
    expect(normalizeLang('nb-NO')).toBe('no');
    expect(normalizeLang('fil')).toBe('tl');
  });

  it('rejects unknown or empty values', () => {
    expect(normalizeLang('')).toBeNull();
    expect(normalizeLang('und')).toBeNull();
    expect(normalizeLang('auto')).toBeNull();
    expect(normalizeLang('x-default')).toBeNull();
    expect(normalizeLang('1234')).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
    expect(normalizeLang(42)).toBeNull();
  });
});

describe('sameLanguage / languageName', () => {
  it('compares after normalisation', () => {
    expect(sameLanguage('en-US', 'en')).toBe(true);
    expect(sameLanguage('de', 'fr')).toBe(false);
    expect(sameLanguage(null, null)).toBe(false);
    expect(sameLanguage('zh', 'zh-TW')).toBe(false);
  });

  it('names known languages and upper-cases unknown codes', () => {
    expect(languageName('de-AT')).toBe('German');
    expect(languageName('zh-TW')).toBe('Chinese (Traditional)');
    expect(languageName('xx')).toBe('XX');
    expect(languageName(null)).toBeNull();
    expect(languageName('')).toBeNull();
  });

  it('offers English first in the target picker and covers every language once', () => {
    expect(TARGET_LANGUAGE_CODES[0]).toBe('en');
    expect(new Set(TARGET_LANGUAGE_CODES).size).toBe(Object.keys(LANGUAGES).length);
  });
});

describe('chunkSegments', () => {
  it('returns no batches for no input', () => {
    expect(chunkSegments([])).toEqual([]);
  });

  it('respects the character budget', () => {
    const texts = ['aaaa', 'bbbb', 'cccc', 'dd'];
    expect(chunkSegments(texts, 8, 100)).toEqual([[0, 1], [2, 3]]);
  });

  it('respects the item budget', () => {
    const texts = ['a', 'b', 'c', 'd', 'e'];
    expect(chunkSegments(texts, 1000, 2)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('gives an oversized segment its own batch', () => {
    const texts = ['x'.repeat(50), 'short', 'y'.repeat(50)];
    expect(chunkSegments(texts, 20, 100)).toEqual([[0], [1], [2]]);
  });

  it('covers every index exactly once', () => {
    const texts = Array.from({ length: 257 }, (_, i) => 'w'.repeat((i * 37) % 90 + 1));
    const seen = chunkSegments(texts).flat();
    expect(seen).toEqual(texts.map((_, i) => i));
  });
});

describe('parseGoogleBatch', () => {
  it('parses auto-detected pairs', () => {
    const body = [['Good morning', 'de'], ['This is a test.', 'de'], ['Hello world', 'es']];
    expect(parseGoogleBatch(body, 3)).toEqual({
      translations: ['Good morning', 'This is a test.', 'Hello world'],
      detected: 'de',
    });
  });

  it('parses explicit-source strings', () => {
    expect(parseGoogleBatch(['Good morning', 'Test'], 2)).toEqual({
      translations: ['Good morning', 'Test'],
      detected: null,
    });
  });

  it('parses a single auto-detected segment returned as a flat pair', () => {
    expect(parseGoogleBatch(['Good morning', 'de'], 1)).toEqual({
      translations: ['Good morning'],
      detected: 'de',
    });
  });

  it('parses a bare string', () => {
    expect(parseGoogleBatch('Hi', 1)).toEqual({ translations: ['Hi'], detected: null });
  });

  it('throws on a count mismatch', () => {
    expect(() => parseGoogleBatch(['one'], 2)).toThrow(/mismatch/);
  });
});

describe('parseLibreBatch', () => {
  it('parses array responses with detection', () => {
    const body = {
      translatedText: ['Good morning', 'Hello world'],
      detectedLanguage: [{ language: 'de', confidence: 90 }, { language: 'es', confidence: 80 }],
    };
    expect(parseLibreBatch(body, 2)).toEqual({
      translations: ['Good morning', 'Hello world'],
      detected: 'de',
    });
  });

  it('parses single string responses', () => {
    expect(parseLibreBatch({ translatedText: 'Hi', detectedLanguage: { language: 'fr' } }, 1)).toEqual({
      translations: ['Hi'],
      detected: 'fr',
    });
  });

  it('surfaces server errors', () => {
    expect(() => parseLibreBatch({ error: 'Invalid API key' }, 1)).toThrow(/Invalid API key/);
    expect(() => parseLibreBatch(null, 1)).toThrow();
    expect(() => parseLibreBatch({}, 1)).toThrow(/translatedText/);
  });
});

describe('majority', () => {
  it('picks the most frequent value', () => {
    expect(majority(['de', 'es', 'de'])).toBe('de');
    expect(majority([])).toBeNull();
  });
});

describe('URL helpers', () => {
  it('only translates http(s) pages', () => {
    expect(isTranslatableUrl('https://example.de/seite')).toBe(true);
    expect(isTranslatableUrl('http://localhost:8080/')).toBe(true);
    expect(isTranslatableUrl('about:blank')).toBe(false);
    expect(isTranslatableUrl('chrome://settings')).toBe(false);
    expect(isTranslatableUrl('file:///tmp/a.html')).toBe(false);
    expect(isTranslatableUrl('')).toBe(false);
    expect(isTranslatableUrl(null)).toBe(false);
    expect(isTranslatableUrl('not a url')).toBe(false);
  });

  it('extracts hosts', () => {
    expect(hostFromUrl('https://WWW.Example.com/a?b')).toBe('www.example.com');
    expect(hostFromUrl('garbage')).toBeNull();
    expect(hostFromUrl(undefined)).toBeNull();
  });

  it('matches hosts and subdomains, ignoring www', () => {
    const list = ['example.com', 'WWW.Spiegel.de'];
    expect(hostMatches('example.com', list)).toBe(true);
    expect(hostMatches('www.example.com', list)).toBe(true);
    expect(hostMatches('news.example.com', list)).toBe(true);
    expect(hostMatches('spiegel.de', list)).toBe(true);
    expect(hostMatches('notexample.com', list)).toBe(false);
    expect(hostMatches(null, list)).toBe(false);
    expect(hostMatches('example.com', [])).toBe(false);
  });
});

describe('text helpers', () => {
  it('needs at least one letter to be meaningful', () => {
    expect(isMeaningfulText('Hallo Welt')).toBe(true);
    expect(isMeaningfulText('日本語')).toBe(true);
    expect(isMeaningfulText('   ')).toBe(false);
    expect(isMeaningfulText('12345')).toBe(false);
    expect(isMeaningfulText('--- ***')).toBe(false);
    expect(isMeaningfulText(undefined)).toBe(false);
  });

  it('keeps the original edge whitespace', () => {
    expect(preserveEdges('  Hallo ', 'Hello')).toBe('  Hallo '.replace('Hallo', 'Hello'));
    expect(preserveEdges('\n\tWelt', ' World ')).toBe('\n\tWorld');
    expect(preserveEdges('Welt', 'World')).toBe('World');
  });
});

describe('page scripts', () => {
  it('embeds the pairs as JSON in the apply script', () => {
    const script = buildApplyScript([['n0', 'Hello'], ['T', 'Title "quoted"']]);
    expect(script).toContain('[["n0","Hello"],["T","Title \\"quoted\\""]]');
    expect(script).toContain('__volaryTranslate');
  });

  it('ships self-contained IIFEs', () => {
    for (const script of [COLLECT_SCRIPT, DETECT_SCRIPT, RESTORE_SCRIPT]) {
      expect(script.trim().startsWith('(function')).toBe(true);
      expect(script.trim().endsWith('})();')).toBe(true);
    }
    expect(COLLECT_SCRIPT).toContain('MutationObserver');
    expect(COLLECT_SCRIPT).toContain('"SCRIPT"');
  });
});

describe('GoogleTranslateBackend', () => {
  it('posts every segment as a q parameter and parses the batch', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('translate.googleapis.com/translate_a/t');
      expect(String(url)).toContain('sl=auto');
      expect(String(url)).toContain('tl=en');
      expect(init?.method).toBe('POST');
      const params = new URLSearchParams(String(init?.body));
      expect(params.getAll('q')).toEqual(['Guten Morgen', 'Hola']);
      return new Response(JSON.stringify([['Good morning', 'de'], ['Hello', 'es']]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const backend = new GoogleTranslateBackend({ fetchImpl });
    const result = await backend.translate(['Guten Morgen', 'Hola'], 'auto', 'en');
    expect(result.translations).toEqual(['Good morning', 'Hello']);
    expect(result.detected).toBe('de');
  });

  it('maps Chinese codes for Google', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('sl=zh-CN');
      expect(String(url)).toContain('tl=zh-TW');
      return new Response(JSON.stringify(['x']), { status: 200 });
    }) as unknown as typeof fetch;
    await new GoogleTranslateBackend({ fetchImpl }).translate(['a'], 'zh', 'zh-TW');
  });

  it('reports rate limiting and HTTP errors', async () => {
    const limited = vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    await expect(new GoogleTranslateBackend({ fetchImpl: limited }).translate(['a'], 'auto', 'en'))
      .rejects.toThrow(/rate limiting/);

    const broken = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(new GoogleTranslateBackend({ fetchImpl: broken }).translate(['a'], 'auto', 'en'))
      .rejects.toThrow(/HTTP 503/);
  });

  it('skips the network for an empty batch', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await new GoogleTranslateBackend({ fetchImpl }).translate([], 'auto', 'en');
    expect(result).toEqual({ translations: [], detected: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('LibreTranslateBackend', () => {
  it('posts JSON with the API key and strips trailing slashes from the URL', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://lt.example.org/translate');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ q: ['Bonjour'], source: 'auto', target: 'en', format: 'text', api_key: 'k123' });
      return new Response(JSON.stringify({ translatedText: ['Hello'], detectedLanguage: [{ language: 'fr' }] }), { status: 200 });
    }) as unknown as typeof fetch;

    const backend = new LibreTranslateBackend({ libreUrl: 'https://lt.example.org///', libreApiKey: 'k123', fetchImpl });
    const result = await backend.translate(['Bonjour'], 'auto', 'en');
    expect(result).toEqual({ translations: ['Hello'], detected: 'fr' });
  });

  it('uses the server error message on failure', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'Visit portal to get a key' }), { status: 403 })) as unknown as typeof fetch;
    await expect(new LibreTranslateBackend({ fetchImpl }).translate(['a'], 'auto', 'en'))
      .rejects.toThrow(/Visit portal/);
  });

  it('maps Traditional Chinese to zt', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).target).toBe('zt');
      return new Response(JSON.stringify({ translatedText: ['x'] }), { status: 200 });
    }) as unknown as typeof fetch;
    await new LibreTranslateBackend({ fetchImpl }).translate(['a'], 'en', 'zh-TW');
  });
});

describe('createBackend', () => {
  it('selects the provider by id and falls back to Google', () => {
    expect(createBackend('google').id).toBe('google');
    expect(createBackend('libretranslate').id).toBe('libretranslate');
    expect(createBackend('nonsense' as never).id).toBe('google');
  });
});
