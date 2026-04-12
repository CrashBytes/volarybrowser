/**
 * History Manager
 *
 * Records browsing history by listening to tab navigation events.
 * Provides IPC interface for history queries from the renderer.
 *
 * @module history-manager
 */

import { addVisit, searchHistory, getRecentHistory, deleteAllHistory, deleteHistoryEntry, deleteHistoryRange } from '../../core/storage/repositories/history';
import { getSetting } from '../../core/storage/repositories/settings';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

/** URLs that should not be recorded in history */
const IGNORED_PREFIXES = ['about:', 'chrome:', 'volary:', 'devtools:', 'data:', 'blob:'];

export class HistoryManager {
  private logger: ILogger;

  constructor() {
    this.logger = LoggerFactory.create('HistoryManager');
  }

  /**
   * Record a navigation event
   * Called by TabManager on did-navigate
   * Double-checks saveHistory setting as a safety guarantee
   */
  recordVisit(url: string, title: string): void {
    // Safety: never record if history is disabled, even if caller forgot to check
    if (getSetting<boolean>('saveHistory', false) !== true) return;
    if (IGNORED_PREFIXES.some(p => url.startsWith(p))) return;
    if (!url) return;

    try {
      addVisit(url, title);
    } catch (error) {
      this.logger.error('Failed to record history visit', error as Error, { url });
    }
  }

  /**
   * Search history
   */
  search(query: string, limit?: number) {
    return searchHistory(query, limit);
  }

  /**
   * Get recent history
   */
  getRecent(limit?: number) {
    return getRecentHistory(limit);
  }

  /**
   * Delete all history
   */
  clearAll(): void {
    deleteAllHistory();
    this.logger.info('All history cleared');
  }

  /**
   * Delete a time range
   */
  clearRange(startTime: number, endTime: number): number {
    return deleteHistoryRange(startTime, endTime);
  }

  /**
   * Delete a single entry
   */
  deleteEntry(id: number): void {
    deleteHistoryEntry(id);
  }
}
