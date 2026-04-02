/**
 * Tab Suspender
 *
 * Automatically suspends (unloads) inactive background tabs after a
 * configurable period to reduce memory usage. Tabs are restored
 * (reloaded) when the user switches back to them.
 *
 * @module tab-suspender
 */

import { TabManager } from './tab-manager';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

const DEFAULT_SUSPEND_AFTER_MS = 10 * 60_000; // 10 minutes

export class TabSuspender {
  private logger: ILogger;
  private tabManager: TabManager;
  private tabLastActive: Map<string, number> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private suspendAfterMs: number;

  constructor(tabManager: TabManager, suspendAfterMs = DEFAULT_SUSPEND_AFTER_MS) {
    this.logger = LoggerFactory.create('TabSuspender');
    this.tabManager = tabManager;
    this.suspendAfterMs = suspendAfterMs;
  }

  start(): void {
    // Check every 60 seconds for tabs to suspend
    this.checkInterval = setInterval(() => this.checkTabs(), 60_000);
    this.logger.info('TabSuspender started', { suspendAfterMs: this.suspendAfterMs });
  }

  /**
   * Record that a tab was just activated
   */
  markActive(tabId: string): void {
    this.tabLastActive.set(tabId, Date.now());
  }

  /**
   * Remove tracking for a closed tab
   */
  removeTab(tabId: string): void {
    this.tabLastActive.delete(tabId);
  }

  private checkTabs(): void {
    const now = Date.now();
    const activeTabId = this.tabManager.getActiveTabId();
    const tabs = this.tabManager.getAllTabStates();

    for (const tab of tabs) {
      // Never suspend the active tab
      if (tab.id === activeTabId) continue;

      // Never suspend tabs without URLs
      if (!tab.url || tab.url === 'about:blank') continue;

      const lastActive = this.tabLastActive.get(tab.id) || tab.createdAt;
      if (now - lastActive > this.suspendAfterMs) {
        this.suspendTab(tab.id);
      }
    }
  }

  private suspendTab(tabId: string): void {
    const tab = this.tabManager.getActiveTab();
    // Don't suspend if it's somehow the active tab
    if (tab && tab.state.id === tabId) return;

    const managedTab = (this.tabManager as any).tabs?.get(tabId);
    if (managedTab && managedTab.view?.webContents && !managedTab.view.webContents.isDestroyed()) {
      const url = managedTab.state.url;
      // Load about:blank to free memory
      managedTab.view.webContents.loadURL('about:blank');
      managedTab.state._suspendedUrl = url;
      this.logger.debug('Tab suspended', { tabId, url });
    }
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
