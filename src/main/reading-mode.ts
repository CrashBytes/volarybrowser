/**
 * Reading Mode
 *
 * Strips a web page down to its article content with clean typography.
 * Uses a content extraction algorithm similar to Readability.
 *
 * @module reading-mode
 */

import { TabManager } from './tab-manager';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

/**
 * JavaScript injected into the page to extract article content
 * and replace the page with a clean reading view.
 */
const READING_MODE_SCRIPT = `
(function() {
  if (document.getElementById('volary-reading-mode')) {
    // Already in reading mode — restore original
    document.getElementById('volary-reading-mode').remove();
    document.getElementById('volary-original-content').style.display = '';
    document.title = document.getElementById('volary-original-content').dataset.originalTitle || document.title;
    return { active: false };
  }

  // Find the main content
  function scoreElement(el) {
    let score = 0;
    const tag = el.tagName.toLowerCase();
    if (tag === 'article') score += 30;
    if (tag === 'main') score += 25;
    if (['div', 'section'].includes(tag)) score += 5;
    if (el.id && /article|content|post|body|entry|main/i.test(el.id)) score += 25;
    if (el.className && /article|content|post|body|entry|main/i.test(el.className)) score += 25;
    if (el.className && /sidebar|nav|footer|header|menu|comment|widget|ad/i.test(el.className)) score -= 25;

    const text = el.innerText || '';
    const words = text.split(/\\s+/).length;
    score += Math.min(words / 10, 50);

    const links = el.querySelectorAll('a');
    const linkText = Array.from(links).reduce((s, a) => s + (a.innerText || '').length, 0);
    const textLen = text.length || 1;
    if (linkText / textLen > 0.5) score -= 30;

    return score;
  }

  // Score all candidate containers
  const candidates = document.querySelectorAll('article, main, [role="main"], div, section');
  let best = null;
  let bestScore = -Infinity;
  for (const el of candidates) {
    const s = scoreElement(el);
    if (s > bestScore) { bestScore = s; best = el; }
  }

  if (!best || bestScore < 20) {
    return { active: false, error: 'Could not find article content' };
  }

  // Extract content
  const title = document.querySelector('h1')?.innerText
    || document.querySelector('[class*="title"]')?.innerText
    || document.title;

  const siteName = document.querySelector('meta[property="og:site_name"]')?.content
    || new URL(window.location.href).hostname;

  // Clone and clean the content
  const clone = best.cloneNode(true);
  // Remove scripts, styles, iframes, nav elements
  clone.querySelectorAll('script, style, iframe, nav, footer, header, aside, [role="navigation"], [role="complementary"], .ad, .ads, .advertisement, .social-share, .comments').forEach(el => el.remove());

  const content = clone.innerHTML;

  // Hide original content
  const wrapper = document.createElement('div');
  wrapper.id = 'volary-original-content';
  wrapper.dataset.originalTitle = document.title;
  while (document.body.firstChild) {
    wrapper.appendChild(document.body.firstChild);
  }
  document.body.appendChild(wrapper);
  wrapper.style.display = 'none';

  // Create reading mode view
  const reader = document.createElement('div');
  reader.id = 'volary-reading-mode';
  reader.innerHTML = \`
    <style>
      #volary-reading-mode {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 999999;
        background: #1a1a2e;
        color: #e0e0e0;
        overflow-y: auto;
        font-family: Georgia, 'Times New Roman', serif;
        line-height: 1.8;
        -webkit-font-smoothing: antialiased;
      }
      #volary-reading-mode .reader-container {
        max-width: 680px;
        margin: 0 auto;
        padding: 60px 24px 120px;
      }
      #volary-reading-mode .reader-site {
        font-family: -apple-system, sans-serif;
        font-size: 13px;
        color: #6366f1;
        margin-bottom: 16px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      #volary-reading-mode .reader-title {
        font-size: 36px;
        font-weight: 700;
        line-height: 1.2;
        color: #f0f0f0;
        margin-bottom: 40px;
      }
      #volary-reading-mode .reader-content {
        font-size: 19px;
        color: #ccc;
      }
      #volary-reading-mode .reader-content p {
        margin-bottom: 1.4em;
      }
      #volary-reading-mode .reader-content h2,
      #volary-reading-mode .reader-content h3 {
        font-family: -apple-system, sans-serif;
        color: #f0f0f0;
        margin: 2em 0 0.8em;
      }
      #volary-reading-mode .reader-content img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        margin: 1.5em 0;
      }
      #volary-reading-mode .reader-content a {
        color: #818cf8;
        text-decoration: underline;
      }
      #volary-reading-mode .reader-content pre,
      #volary-reading-mode .reader-content code {
        font-family: 'Fira Code', monospace;
        background: #16213e;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 15px;
      }
      #volary-reading-mode .reader-content pre {
        padding: 16px;
        overflow-x: auto;
        margin: 1.5em 0;
      }
      #volary-reading-mode .reader-content blockquote {
        border-left: 3px solid #6366f1;
        padding-left: 20px;
        margin: 1.5em 0;
        color: #aaa;
        font-style: italic;
      }
      #volary-reading-mode .reader-content ul,
      #volary-reading-mode .reader-content ol {
        padding-left: 24px;
        margin-bottom: 1.4em;
      }
      #volary-reading-mode .reader-content li {
        margin-bottom: 0.5em;
      }
    </style>
    <div class="reader-container">
      <div class="reader-site">\${siteName}</div>
      <h1 class="reader-title">\${title}</h1>
      <div class="reader-content">\${content}</div>
    </div>
  \`;

  document.body.appendChild(reader);
  document.title = '📖 ' + title;
  reader.scrollTop = 0;

  return { active: true, title: title };
})();
`;

export class ReadingMode {
  private logger: ILogger;
  private tabManager: TabManager;

  constructor(tabManager: TabManager) {
    this.logger = LoggerFactory.create('ReadingMode');
    this.tabManager = tabManager;
  }

  /**
   * Toggle reading mode on the active tab
   */
  async toggle(): Promise<{ active: boolean; error?: string }> {
    const tab = this.tabManager.getActiveTab();
    if (!tab) {
      return { active: false, error: 'No active tab' };
    }

    try {
      const result = await tab.view.webContents.executeJavaScript(READING_MODE_SCRIPT);
      this.logger.info('Reading mode toggled', { active: result.active });
      return result;
    } catch (error) {
      this.logger.error('Failed to toggle reading mode', error as Error);
      return { active: false, error: 'Failed to enter reading mode' };
    }
  }
}
