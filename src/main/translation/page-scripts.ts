/**
 * Translation - scripts injected into tab pages
 *
 * Tabs have no preload, so the main process drives translation entirely
 * through `webContents.executeJavaScript`. These scripts keep their state
 * on `window.__volaryTranslate` so successive calls can find the text
 * nodes they touched earlier and restore them.
 *
 * Keys handed back to the main process:
 *   "n<id>"  a text node
 *   "a<id>"  an attribute (placeholder / alt / title / value)
 *   "T"      document.title
 *
 * @module translation/page-scripts
 */

export const PAGE_STATE_KEY = '__volaryTranslate';

/** Largest number of segments collected from one page */
export const MAX_SEGMENTS_PER_PAGE = 6000;

/** Elements whose subtree is never translated */
const SKIP_TAGS = [
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
  'SVG', 'MATH', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS', 'VIDEO', 'AUDIO',
];

/** Shared helper source, prepended to every script */
const COMMON = `
  const SKIP = new Set(${JSON.stringify(SKIP_TAGS)});
  const LETTER = /\\p{L}/u;
  function meaningful(s) { return typeof s === 'string' && s.trim().length > 0 && LETTER.test(s); }
  function skipElement(el) {
    if (SKIP.has(el.tagName)) return true;
    if (el.getAttribute('translate') === 'no') return true;
    if (el.classList && el.classList.contains('notranslate')) return true;
    if (el.isContentEditable) return true;
    if (el.id === 'volary-cb-svg') return true;
    return false;
  }
  function getState() {
    let S = window['${PAGE_STATE_KEY}'];
    if (!S) {
      S = {
        nodes: new Map(),      // key -> Text
        keys: new WeakMap(),   // Text -> key
        originals: new Map(),  // key -> original nodeValue
        lastSet: new WeakMap(),// Text -> value we wrote
        attrs: new Map(),      // key -> { el, name, original }
        seen: new WeakSet(),   // nodes / attribute owners already collected
        titleOriginal: null,
        titleSent: false,
        dirty: true,
        nextId: 0,
        observer: null,
      };
      window['${PAGE_STATE_KEY}'] = S;
    }
    return S;
  }
`;

/**
 * Report the page's declared language and a text sample for detection.
 * Returns `{ lang: string, sample: string }`.
 */
export const DETECT_SCRIPT = `
(function () {
  ${COMMON}
  const html = document.documentElement;
  const meta = document.querySelector('meta[http-equiv="content-language" i]');
  const lang = (html && html.getAttribute('lang')) || (meta && meta.getAttribute('content')) || '';

  let sample = '';
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) return skipElement(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return meaningful(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while (sample.length < 800 && (n = walker.nextNode())) {
      const t = n.nodeValue.replace(/\\s+/g, ' ').trim();
      if (t.length < 3) continue;
      sample += (sample ? ' ' : '') + t;
    }
  }
  return { lang: String(lang).slice(0, 35), sample: sample.slice(0, 800) };
})();
`;

/**
 * Collect every not-yet-seen translatable segment.
 * Returns `{ segments: Array<{ k: string, t: string }>, total: number }`.
 *
 * The first call installs a MutationObserver; later calls return only
 * segments added since (or rewritten by the page), and return nothing
 * at all when no DOM change happened in between.
 */
export const COLLECT_SCRIPT = `
(function () {
  ${COMMON}
  const S = getState();
  if (!document.body) return { segments: [], total: S.nodes.size };

  if (!S.observer) {
    S.observer = new MutationObserver(function (records) {
      for (const r of records) {
        if (r.type === 'characterData') {
          const node = r.target;
          // The page rewrote a node we translated (framework re-render): collect it again.
          if (S.keys.has(node) && node.nodeValue !== S.lastSet.get(node)) {
            S.seen.delete(node);
            S.dirty = true;
          }
        } else {
          S.dirty = true;
        }
      }
    });
    S.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (!S.dirty) return { segments: [], total: S.nodes.size };
  S.dirty = false;

  const segments = [];
  const limit = ${MAX_SEGMENTS_PER_PAGE};

  if (!S.titleSent && meaningful(document.title)) {
    S.titleOriginal = document.title;
    S.titleSent = true;
    segments.push({ k: 'T', t: document.title.trim() });
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === 1) return skipElement(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return (!S.seen.has(n) && meaningful(n.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let n;
  while ((n = walker.nextNode()) && S.nodes.size < limit) {
    S.seen.add(n);
    let key = S.keys.get(n);
    if (!key) {
      key = 'n' + (S.nextId++);
      S.keys.set(n, key);
      S.nodes.set(key, n);
    }
    S.originals.set(key, n.nodeValue);
    segments.push({ k: key, t: n.nodeValue.trim() });
  }

  // Attributes shown to the user
  const ATTR_SELECTORS = [
    ['input[placeholder], textarea[placeholder]', 'placeholder'],
    ['img[alt]', 'alt'],
    ['input[type="submit"][value], input[type="button"][value], input[type="reset"][value]', 'value'],
    ['a[title], button[title], img[title], abbr[title], span[title], div[title], li[title]', 'title'],
  ];
  for (const [selector, name] of ATTR_SELECTORS) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      if (S.nodes.size + S.attrs.size >= limit) break;
      const marker = el; // seen is keyed per element+attribute via a data flag
      const flag = 'volaryTx' + name;
      if (marker.dataset && marker.dataset[flag] === '1') continue;
      let ancestor = el; let skip = false;
      while (ancestor && ancestor.nodeType === 1) { if (skipElement(ancestor) && ancestor !== el) { skip = true; break; } ancestor = ancestor.parentElement; }
      if (skip) continue;
      const value = el.getAttribute(name);
      if (!meaningful(value)) continue;
      if (marker.dataset) marker.dataset[flag] = '1';
      const key = 'a' + (S.nextId++);
      S.attrs.set(key, { el: el, name: name, original: value });
      segments.push({ k: key, t: value.trim() });
    }
  }

  return { segments: segments, total: S.nodes.size + S.attrs.size };
})();
`;

/**
 * Build the script that writes translated segments back into the page.
 * Returns the number of segments applied.
 */
export function buildApplyScript(pairs: ReadonlyArray<readonly [string, string]>): string {
  return `
(function (pairs) {
  const S = window['${PAGE_STATE_KEY}'];
  if (!S) return 0;
  function edges(original, translated) {
    const lead = (/^\\s*/.exec(original) || [''])[0];
    const trail = (/\\s*$/.exec(original) || [''])[0];
    return lead + translated.trim() + trail;
  }
  let applied = 0;
  for (const pair of pairs) {
    const key = pair[0], text = pair[1];
    if (typeof text !== 'string' || !text.trim()) continue;
    if (key === 'T') {
      document.title = text;
      applied++;
    } else if (key.charCodeAt(0) === 110 /* n */) {
      const node = S.nodes.get(key);
      if (!node) continue;
      const value = edges(S.originals.get(key) || '', text);
      S.lastSet.set(node, value);
      node.nodeValue = value;
      applied++;
    } else if (key.charCodeAt(0) === 97 /* a */) {
      const a = S.attrs.get(key);
      if (!a || !a.el) continue;
      a.el.setAttribute(a.name, text);
      applied++;
    }
  }
  return applied;
})(${JSON.stringify(pairs)});
`;
}

/**
 * Put every original string back and drop the page state.
 * Returns the number of segments restored.
 */
export const RESTORE_SCRIPT = `
(function () {
  const S = window['${PAGE_STATE_KEY}'];
  if (!S) return 0;
  if (S.observer) { try { S.observer.disconnect(); } catch (e) {} }
  let restored = 0;
  for (const [key, node] of S.nodes) {
    const original = S.originals.get(key);
    if (typeof original === 'string' && node.nodeValue !== original) {
      node.nodeValue = original;
      restored++;
    }
  }
  for (const [, a] of S.attrs) {
    if (a.el) {
      a.el.setAttribute(a.name, a.original);
      if (a.el.dataset) delete a.el.dataset['volaryTx' + a.name];
      restored++;
    }
  }
  if (typeof S.titleOriginal === 'string') { document.title = S.titleOriginal; restored++; }
  delete window['${PAGE_STATE_KEY}'];
  return restored;
})();
`;
