/**
 * chrome.tabs API Implementation
 *
 * Read-only tab information and basic tab operations.
 * Backed by TabManager.
 *
 * @module extensions/api/tabs
 */

import { TabManager } from '../../tab-manager';

export class TabsAPI {
  private tabManager: TabManager;

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
  }

  /**
   * chrome.tabs.query
   */
  async query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<unknown[]> {
    const allTabs = this.tabManager.getAllTabStates();
    let results = allTabs;

    if (queryInfo.active) {
      const activeId = this.tabManager.getActiveTabId();
      results = results.filter((t) => t.id === activeId);
    }

    return results.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.isActive,
      favIconUrl: t.favicon,
      status: t.isLoading ? 'loading' : 'complete',
    }));
  }

  /**
   * chrome.tabs.create
   */
  async create(createProperties: { url?: string; active?: boolean }): Promise<unknown> {
    const result = await this.tabManager.createTab({
      url: createProperties.url,
      active: createProperties.active,
    });
    if (result.success && result.data) {
      return { id: result.data.tabId };
    }
    return null;
  }
}
