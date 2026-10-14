/**
 * Translation Manager
 *
 * Detects the language of loaded pages and translates their text in place,
 * driven by the `translate*` settings:
 *
 *   translateMode        off | ask | auto
 *   translateTargetLang  e.g. "en"
 *   translateProvider    google | libretranslate
 *   translateLibreUrl / translateLibreApiKey
 *   translateNeverSites  hosts that are never translated
 *   translateAlwaysLangs languages translated without asking (in "ask" mode)
 *   translateNeverLangs  languages never offered
 *
 * One state record per tab is broadcast to the renderer on 'translate:status'
 * so the chrome can show the offer bar, the progress and the toolbar state.
 *
 * @module translation/translation-manager
 */

import { BrowserWindow, WebContents } from 'electron';
import { getSetting, setSetting } from '../../../core/storage/repositories/settings';
import { ILogger } from '../types';
import { LoggerFactory } from '../utils/logger';
import {
  TranslateMode,
  TranslateProvider,
  TranslateStatus,
  TranslateTabState,
  TRANSLATE_DEFAULTS,
  TRANSLATE_SETTINGS,
  languageName,
  normalizeLang,
  sameLanguage,
} from '../../shared/translation';
import {
  chunkSegments,
  hostFromUrl,
  hostMatches,
  isMeaningfulText,
  isTranslatableUrl,
} from './language';
import { createBackend, TranslationBackend } from './providers';
import { COLLECT_SCRIPT, DETECT_SCRIPT, RESTORE_SCRIPT, buildApplyScript } from './page-scripts';

export const TRANSLATE_STATUS_CHANNEL = 'translate:status';

/** Parallel provider requests per page */
const CONCURRENCY = 4;
/** How often a translated page is checked for new text */
const POLL_INTERVAL_MS = 2000;

interface Segment { k: string; t: string }

interface TabRecord {
  tabId: string;
  wc: WebContents | null;
  url: string;
  status: TranslateStatus;
  sourceLang: string | null;
  error: string | null;
  segments: number;
  /** Bumped on every navigation so stale async work can bail out */
  generation: number;
  pollTimer: NodeJS.Timeout | null;
  polling: boolean;
}

export interface TranslateSettings {
  mode: TranslateMode;
  targetLang: string;
  provider: TranslateProvider;
  libreUrl: string;
  libreApiKey: string;
  neverSites: string[];
  alwaysLangs: string[];
  neverLangs: string[];
}

export class TranslationManager {
  private logger: ILogger;
  private window: BrowserWindow | null = null;
  private tabs: Map<string, TabRecord> = new Map();
  private settings: TranslateSettings = { ...TRANSLATE_DEFAULTS };
  private backend: TranslationBackend;
  private activeTabIdProvider: () => string | null = () => null;

  constructor() {
    this.logger = LoggerFactory.create('TranslationManager');
    this.backend = createBackend(this.settings.provider);
  }

  /** Load settings. Call after the database is open. */
  initialize(): void {
    this.reloadSettings();
    this.logger.info('TranslationManager initialized', {
      mode: this.settings.mode,
      target: this.settings.targetLang,
      provider: this.settings.provider,
    });
  }

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  /** Lets the manager resolve "the active tab" without a hard TabManager dependency */
  setActiveTabResolver(resolver: () => string | null): void {
    this.activeTabIdProvider = resolver;
  }

  /** Re-read every translate* setting; called after the settings UI writes one */
  reloadSettings(): void {
    const read = <T>(key: string, fallback: T): T => {
      try { return getSetting<T>(key, fallback); } catch { return fallback; }
    };
    const strList = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

    const mode = read<string>(TRANSLATE_SETTINGS.mode, TRANSLATE_DEFAULTS.mode);
    const provider = read<string>(TRANSLATE_SETTINGS.provider, TRANSLATE_DEFAULTS.provider);

    this.settings = {
      mode: (['off', 'ask', 'auto'] as const).includes(mode as TranslateMode) ? (mode as TranslateMode) : 'off',
      targetLang: normalizeLang(read<string>(TRANSLATE_SETTINGS.targetLang, TRANSLATE_DEFAULTS.targetLang)) ?? 'en',
      provider: provider === 'libretranslate' ? 'libretranslate' : 'google',
      libreUrl: read<string>(TRANSLATE_SETTINGS.libreUrl, TRANSLATE_DEFAULTS.libreUrl) || TRANSLATE_DEFAULTS.libreUrl,
      libreApiKey: read<string>(TRANSLATE_SETTINGS.libreApiKey, ''),
      neverSites: strList(read<unknown>(TRANSLATE_SETTINGS.neverSites, [])),
      alwaysLangs: strList(read<unknown>(TRANSLATE_SETTINGS.alwaysLangs, [])),
      neverLangs: strList(read<unknown>(TRANSLATE_SETTINGS.neverLangs, [])),
    };

    this.backend = createBackend(this.settings.provider, {
      libreUrl: this.settings.libreUrl,
      libreApiKey: this.settings.libreApiKey,
    });

    // Keep the "offer" bars honest when translation is switched off
    if (this.settings.mode === 'off') {
      for (const rec of this.tabs.values()) {
        if (rec.status === 'offer') this.setStatus(rec, 'idle');
      }
    }
  }

  getSettings(): Readonly<TranslateSettings> {
    return this.settings;
  }

  // -- Tab lifecycle hooks (called by TabManager) --

  /** Main-frame navigation started a new document: forget the old page */
  onNavigated(tabId: string, url: string): void {
    const rec = this.record(tabId);
    rec.generation++;
    rec.url = url;
    rec.sourceLang = null;
    rec.error = null;
    rec.segments = 0;
    this.stopPolling(rec);
    this.setStatus(rec, 'idle');
  }

  /** Main frame finished loading: detect and, depending on mode, translate */
  async onPageLoaded(tabId: string, wc: WebContents, url: string): Promise<void> {
    const rec = this.record(tabId);
    rec.wc = wc;
    rec.url = url;
    const gen = rec.generation;

    if (this.settings.mode === 'off') return;
    if (!isTranslatableUrl(url)) return;
    if (rec.status === 'translated' || rec.status === 'translating') return;
    if (hostMatches(hostFromUrl(url), this.settings.neverSites)) return;

    let sourceLang: string | null = null;
    try {
      const detected = await this.detectLanguage(wc);
      if (gen !== rec.generation || wc.isDestroyed()) return;
      sourceLang = detected;
    } catch (error) {
      this.logger.debug('Language detection failed', { tabId, error: (error as Error).message });
      return;
    }

    if (!sourceLang) return;
    rec.sourceLang = sourceLang;

    if (sameLanguage(sourceLang, this.settings.targetLang)) {
      this.setStatus(rec, 'idle');
      return;
    }
    if (this.settings.neverLangs.some(l => sameLanguage(l, sourceLang))) {
      this.setStatus(rec, 'idle');
      return;
    }

    const autoTranslate = this.settings.mode === 'auto'
      || this.settings.alwaysLangs.some(l => sameLanguage(l, sourceLang));

    if (autoTranslate) {
      await this.translateTab(tabId);
    } else {
      this.setStatus(rec, 'offer');
    }
  }

  onTabClosed(tabId: string): void {
    const rec = this.tabs.get(tabId);
    if (!rec) return;
    this.stopPolling(rec);
    this.tabs.delete(tabId);
  }

  // -- Commands --

  getState(tabId?: string | null): TranslateTabState | null {
    const id = tabId ?? this.activeTabIdProvider();
    if (!id) return null;
    const rec = this.tabs.get(id);
    return rec ? this.toState(rec) : this.toState(this.record(id));
  }

  /** Translate when idle/offered, restore when translated */
  async toggle(tabId?: string | null): Promise<TranslateTabState | null> {
    const id = tabId ?? this.activeTabIdProvider();
    if (!id) return null;
    const rec = this.record(id);
    if (rec.status === 'translated' || rec.status === 'translating') {
      return this.restoreTab(id);
    }
    return this.translateTab(id);
  }

  async translateTab(tabId?: string | null): Promise<TranslateTabState | null> {
    const id = tabId ?? this.activeTabIdProvider();
    if (!id) return null;
    const rec = this.record(id);
    const wc = rec.wc;
    if (!wc || wc.isDestroyed()) {
      rec.error = 'Page is not available';
      this.setStatus(rec, 'error');
      return this.toState(rec);
    }
    if (!isTranslatableUrl(rec.url || wc.getURL())) {
      rec.error = 'This page cannot be translated';
      this.setStatus(rec, 'error');
      return this.toState(rec);
    }
    if (rec.status === 'translating') return this.toState(rec);

    const gen = rec.generation;
    rec.error = null;
    this.setStatus(rec, 'translating');

    try {
      const applied = await this.translateNewSegments(rec, gen);
      if (gen !== rec.generation) return this.toState(rec);
      rec.segments += applied;
      this.setStatus(rec, 'translated');
      this.startPolling(rec);
      this.logger.info('Page translated', {
        tabId: id,
        from: rec.sourceLang,
        to: this.settings.targetLang,
        segments: rec.segments,
      });
    } catch (error) {
      if (gen !== rec.generation) return this.toState(rec);
      rec.error = (error as Error).message || 'Translation failed';
      this.logger.error('Translation failed', error as Error, { tabId: id, url: rec.url });
      this.setStatus(rec, 'error');
    }
    return this.toState(rec);
  }

  async restoreTab(tabId?: string | null): Promise<TranslateTabState | null> {
    const id = tabId ?? this.activeTabIdProvider();
    if (!id) return null;
    const rec = this.record(id);
    this.stopPolling(rec);
    rec.generation++; // cancels in-flight translation work
    const wc = rec.wc;
    if (wc && !wc.isDestroyed()) {
      try {
        await wc.executeJavaScript(RESTORE_SCRIPT);
      } catch (error) {
        this.logger.debug('Restore script failed', { tabId: id, error: (error as Error).message });
      }
    }
    rec.segments = 0;
    rec.error = null;
    // Keep offering when the page is known to be in another language
    const canOffer = this.settings.mode !== 'off'
      && rec.sourceLang !== null
      && !sameLanguage(rec.sourceLang, this.settings.targetLang);
    this.setStatus(rec, canOffer ? 'offer' : 'idle');
    return this.toState(rec);
  }

  dismiss(tabId?: string | null): TranslateTabState | null {
    const id = tabId ?? this.activeTabIdProvider();
    if (!id) return null;
    const rec = this.record(id);
    if (rec.status === 'offer' || rec.status === 'error') {
      this.setStatus(rec, 'dismissed');
    }
    return this.toState(rec);
  }

  /** Never translate the given host (defaults to the active tab's host) */
  async addNeverSite(host?: string | null, tabId?: string | null): Promise<string | null> {
    const id = tabId ?? this.activeTabIdProvider();
    const rec = id ? this.record(id) : null;
    const target = (host && host.trim().toLowerCase()) || hostFromUrl(rec?.url ?? rec?.wc?.getURL());
    if (!target) return null;

    if (!hostMatches(target, this.settings.neverSites)) {
      this.settings.neverSites = [...this.settings.neverSites, target];
      this.persist(TRANSLATE_SETTINGS.neverSites, this.settings.neverSites);
    }

    for (const r of this.tabs.values()) {
      if (hostMatches(hostFromUrl(r.url), [target])) {
        if (r.status === 'translated' || r.status === 'translating') await this.restoreTab(r.tabId);
        if (r.status === 'offer') this.setStatus(r, 'dismissed');
      }
    }
    return target;
  }

  /** Always translate pages in `lang` without asking; translates the active tab if it matches */
  async addAlwaysLang(lang: string, tabId?: string | null): Promise<string | null> {
    const code = normalizeLang(lang);
    if (!code) return null;
    if (!this.settings.alwaysLangs.some(l => sameLanguage(l, code))) {
      this.settings.alwaysLangs = [...this.settings.alwaysLangs, code];
      this.persist(TRANSLATE_SETTINGS.alwaysLangs, this.settings.alwaysLangs);
    }
    this.settings.neverLangs = this.settings.neverLangs.filter(l => !sameLanguage(l, code));
    this.persist(TRANSLATE_SETTINGS.neverLangs, this.settings.neverLangs);

    const id = tabId ?? this.activeTabIdProvider();
    const rec = id ? this.tabs.get(id) : undefined;
    if (rec && rec.status === 'offer' && sameLanguage(rec.sourceLang, code)) {
      await this.translateTab(rec.tabId);
    }
    return code;
  }

  /** Never offer to translate pages in `lang` */
  async addNeverLang(lang: string): Promise<string | null> {
    const code = normalizeLang(lang);
    if (!code) return null;
    if (!this.settings.neverLangs.some(l => sameLanguage(l, code))) {
      this.settings.neverLangs = [...this.settings.neverLangs, code];
      this.persist(TRANSLATE_SETTINGS.neverLangs, this.settings.neverLangs);
    }
    this.settings.alwaysLangs = this.settings.alwaysLangs.filter(l => !sameLanguage(l, code));
    this.persist(TRANSLATE_SETTINGS.alwaysLangs, this.settings.alwaysLangs);

    for (const r of this.tabs.values()) {
      if (sameLanguage(r.sourceLang, code)) {
        if (r.status === 'translated' || r.status === 'translating') await this.restoreTab(r.tabId);
        if (r.status === 'offer') this.setStatus(r, 'dismissed');
      }
    }
    return code;
  }

  destroy(): void {
    for (const rec of this.tabs.values()) this.stopPolling(rec);
    this.tabs.clear();
    this.window = null;
  }

  // -- Internals --

  private record(tabId: string): TabRecord {
    let rec = this.tabs.get(tabId);
    if (!rec) {
      rec = {
        tabId,
        wc: null,
        url: '',
        status: 'idle',
        sourceLang: null,
        error: null,
        segments: 0,
        generation: 0,
        pollTimer: null,
        polling: false,
      };
      this.tabs.set(tabId, rec);
    }
    return rec;
  }

  private async detectLanguage(wc: WebContents): Promise<string | null> {
    const result = await wc.executeJavaScript(DETECT_SCRIPT) as { lang?: unknown; sample?: unknown } | null;
    const declared = normalizeLang(result?.lang);
    if (declared) return declared;

    const sample = typeof result?.sample === 'string' ? result.sample.trim() : '';
    if (sample.length < 20) return null;

    // No declared language: let the provider detect from a short sample
    const batch = await this.backend.translate([sample.slice(0, 400)], 'auto', this.settings.targetLang);
    return normalizeLang(batch.detected);
  }

  /**
   * Collect untranslated segments from the page, translate them in
   * parallel batches and write each batch back as soon as it returns.
   * Resolves with the number of segments applied.
   */
  private async translateNewSegments(rec: TabRecord, gen: number): Promise<number> {
    const wc = rec.wc;
    if (!wc || wc.isDestroyed()) throw new Error('Page is not available');

    const collected = await wc.executeJavaScript(COLLECT_SCRIPT) as { segments?: Segment[] } | null;
    if (gen !== rec.generation) return 0;

    const segments = (collected?.segments ?? []).filter(
      (s): s is Segment => !!s && typeof s.k === 'string' && isMeaningfulText(s.t),
    );
    if (segments.length === 0) return 0;

    const texts = segments.map(s => s.t);
    const batches = chunkSegments(texts);
    const source = rec.sourceLang ?? 'auto';
    const target = this.settings.targetLang;
    let applied = 0;
    let firstError: Error | null = null;

    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < batches.length) {
        const batch = batches[next++];
        if (!batch) break;
        if (gen !== rec.generation) return;
        try {
          const result = await this.backend.translate(batch.map(i => texts[i] ?? ''), source, target);
          if (gen !== rec.generation || !rec.wc || rec.wc.isDestroyed()) return;
          if (result.detected && !rec.sourceLang) {
            rec.sourceLang = normalizeLang(result.detected);
          }
          const pairs = batch.map((i, j) => [segments[i]!.k, result.translations[j] ?? ''] as const);
          const count = await rec.wc.executeJavaScript(buildApplyScript(pairs)) as number;
          applied += typeof count === 'number' ? count : 0;
          if (rec.status === 'translating') {
            this.broadcast(rec, applied); // progress for the bar
          }
        } catch (error) {
          if (!firstError) firstError = error as Error;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));

    if (applied === 0 && firstError) throw firstError;
    return applied;
  }

  private startPolling(rec: TabRecord): void {
    this.stopPolling(rec);
    rec.pollTimer = setInterval(() => {
      void this.pollTick(rec);
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(rec: TabRecord): void {
    if (rec.pollTimer) {
      clearInterval(rec.pollTimer);
      rec.pollTimer = null;
    }
    rec.polling = false;
  }

  /** Translate text the page added since the last pass */
  private async pollTick(rec: TabRecord): Promise<void> {
    if (rec.polling || rec.status !== 'translated') return;
    const wc = rec.wc;
    if (!wc || wc.isDestroyed()) {
      this.stopPolling(rec);
      return;
    }
    rec.polling = true;
    const gen = rec.generation;
    try {
      const applied = await this.translateNewSegments(rec, gen);
      if (gen === rec.generation && applied > 0) {
        rec.segments += applied;
        this.broadcast(rec);
      }
    } catch (error) {
      this.logger.debug('Incremental translation failed', { tabId: rec.tabId, error: (error as Error).message });
    } finally {
      rec.polling = false;
    }
  }

  private setStatus(rec: TabRecord, status: TranslateStatus): void {
    rec.status = status;
    this.broadcast(rec);
  }

  private broadcast(rec: TabRecord, inFlightSegments = 0): void {
    if (!this.window || this.window.isDestroyed()) return;
    const state = this.toState(rec);
    if (inFlightSegments) state.segments = rec.segments + inFlightSegments;
    this.window.webContents.send(TRANSLATE_STATUS_CHANNEL, state);
  }

  private toState(rec: TabRecord): TranslateTabState {
    const target = this.settings.targetLang;
    return {
      tabId: rec.tabId,
      status: rec.status,
      sourceLang: rec.sourceLang,
      targetLang: target,
      sourceName: languageName(rec.sourceLang),
      targetName: languageName(target) ?? target.toUpperCase(),
      segments: rec.segments,
      error: rec.error,
    };
  }

  private persist(key: string, value: unknown): void {
    try {
      setSetting(key, value);
    } catch (error) {
      this.logger.error('Failed to persist translation setting', error as Error, { key });
    }
  }
}
