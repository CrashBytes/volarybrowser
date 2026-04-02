/**
 * Crash Recovery
 *
 * Persists open tab state to SQLite on every navigation so that
 * if the app crashes, tabs can be restored on relaunch.
 *
 * @module crash-recovery
 */

import { getDatabase } from '../../core/storage/database';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

export interface SavedTab {
  tabId: string;
  url: string;
  title: string;
  position: number;
  isActive: boolean;
}

export class CrashRecovery {
  private logger: ILogger;

  constructor() {
    this.logger = LoggerFactory.create('CrashRecovery');
  }

  /**
   * Save the current set of open tabs
   * Called on every navigation and tab create/close
   */
  saveTabs(tabs: Array<{ id: string; url: string; title: string; isActive: boolean }>): void {
    try {
      const db = getDatabase();
      const transaction = db.transaction(() => {
        db.prepare('DELETE FROM open_tabs').run();
        const stmt = db.prepare(
          'INSERT INTO open_tabs (tab_id, url, title, position, is_active) VALUES (?, ?, ?, ?, ?)'
        );
        tabs.forEach((tab, i) => {
          if (tab.url && !tab.url.startsWith('about:')) {
            stmt.run(tab.id, tab.url, tab.title, i, tab.isActive ? 1 : 0);
          }
        });
      });
      transaction();
    } catch (error) {
      this.logger.error('Failed to save tab state', error as Error);
    }
  }

  /**
   * Get previously saved tabs (for restore after crash)
   */
  getSavedTabs(): SavedTab[] {
    try {
      const db = getDatabase();
      const rows = db.prepare(
        'SELECT tab_id, url, title, position, is_active FROM open_tabs ORDER BY position'
      ).all() as Array<{
        tab_id: string; url: string; title: string; position: number; is_active: number;
      }>;

      return rows.map(r => ({
        tabId: r.tab_id,
        url: r.url,
        title: r.title,
        position: r.position,
        isActive: r.is_active === 1,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Clear saved tabs (called after successful clean shutdown)
   */
  clearSavedTabs(): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM open_tabs').run();
    } catch (error) {
      this.logger.error('Failed to clear saved tabs', error as Error);
    }
  }

  /**
   * Check if there are tabs to restore
   */
  hasTabsToRestore(): boolean {
    return this.getSavedTabs().length > 0;
  }
}
