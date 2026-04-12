/**
 * Cookie Manager
 *
 * Tracks cookies per tab and automatically deletes them when
 * the tab is closed (session-scoped cookies).
 *
 * @module privacy/cookie-manager
 */

import { session } from 'electron';
import { LoggerFactory } from '../utils/logger';

const logger = LoggerFactory.create('CookieManager');

export class CookieManager {
  private tabDomains: Map<string, Set<string>> = new Map();
  private enabled = false;

  initialize(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('CookieManager initialized', { enabled });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Track a domain visit for a tab
   */
  trackDomain(tabId: string, url: string): void {
    if (!this.enabled) return;
    try {
      const hostname = new URL(url).hostname;
      if (!hostname) return;
      if (!this.tabDomains.has(tabId)) {
        this.tabDomains.set(tabId, new Set());
      }
      this.tabDomains.get(tabId)!.add(hostname);
    } catch { /* ignore invalid URLs */ }
  }

  /**
   * Delete all cookies for domains visited by a tab
   */
  async cleanupTab(tabId: string): Promise<void> {
    if (!this.enabled) return;

    const domains = this.tabDomains.get(tabId);
    if (!domains || domains.size === 0) {
      this.tabDomains.delete(tabId);
      return;
    }

    const cookies = await session.defaultSession.cookies.get({});
    let removed = 0;

    for (const cookie of cookies) {
      const cookieDomain = (cookie.domain || '').replace(/^\./, '');
      for (const visitedDomain of domains) {
        if (cookieDomain === visitedDomain || visitedDomain.endsWith('.' + cookieDomain) || cookieDomain.endsWith('.' + visitedDomain)) {
          const protocol = cookie.secure ? 'https' : 'http';
          const url = `${protocol}://${cookieDomain}${cookie.path || '/'}`;
          try {
            await session.defaultSession.cookies.remove(url, cookie.name);
            removed++;
          } catch { /* ignore removal errors */ }
          break;
        }
      }
    }

    this.tabDomains.delete(tabId);
    if (removed > 0) {
      logger.info('Cleaned up cookies for closed tab', { tabId, removed, domains: Array.from(domains) });
    }
  }

  /**
   * Remove tracking for a tab without cleaning cookies
   */
  removeTab(tabId: string): void {
    this.tabDomains.delete(tabId);
  }

  destroy(): void {
    this.tabDomains.clear();
  }
}
