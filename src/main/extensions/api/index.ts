/**
 * Extension API Registry
 *
 * Aggregates all chrome.* API implementations into a single registry.
 *
 * @module extensions/api
 */

import { StorageAPI } from './storage';
import { TabsAPI } from './tabs';
import { RuntimeAPI } from './runtime';
import { TabManager } from '../../tab-manager';

export class ExtensionAPIRegistry {
  public readonly storage: StorageAPI;
  public readonly tabs: TabsAPI;
  public readonly runtime: RuntimeAPI;

  constructor(tabManager: TabManager) {
    this.storage = new StorageAPI();
    this.tabs = new TabsAPI(tabManager);
    this.runtime = new RuntimeAPI();
  }
}

export { StorageAPI, TabsAPI, RuntimeAPI };
