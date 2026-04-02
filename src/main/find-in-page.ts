/**
 * Find in Page
 *
 * Wrapper around webContents.findInPage() for in-page text search.
 *
 * @module find-in-page
 */

import { TabManager } from './tab-manager';

export interface FindResult {
  requestId: number;
  matches: number;
  activeMatchOrdinal: number;
}

export class FindInPage {
  private tabManager: TabManager;
  private currentText = '';

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
  }

  /**
   * Start or continue a find operation
   */
  find(text: string, forward = true): FindResult | null {
    const tab = this.tabManager.getActiveTab();
    if (!tab || !text) return null;

    this.currentText = text;
    const requestId = tab.view.webContents.findInPage(text, {
      forward,
      findNext: text === this.currentText,
    });

    return { requestId, matches: 0, activeMatchOrdinal: 0 };
  }

  /**
   * Find next match
   */
  findNext(): FindResult | null {
    if (!this.currentText) return null;
    return this.find(this.currentText, true);
  }

  /**
   * Find previous match
   */
  findPrevious(): FindResult | null {
    if (!this.currentText) return null;
    return this.find(this.currentText, false);
  }

  /**
   * Stop finding and clear highlights
   */
  stop(): void {
    const tab = this.tabManager.getActiveTab();
    if (tab) {
      tab.view.webContents.stopFindInPage('clearSelection');
    }
    this.currentText = '';
  }
}
