/**
 * chrome.storage API Implementation
 *
 * Per-extension isolated storage backed by SQLite.
 * Supports both chrome.storage.local and chrome.storage.sync areas.
 * (sync area stores locally — cloud sync deferred to Phase 6)
 *
 * @module extensions/api/storage
 */

import {
  extStorageGet,
  extStorageSet,
  extStorageRemove,
  extStorageClear,
} from '../../../../core/storage/repositories/extension-storage';

type StorageArea = 'local' | 'sync';

export class StorageAPI {
  /**
   * chrome.storage.local.get / chrome.storage.sync.get
   */
  async get(
    extensionId: string,
    keys?: string | string[] | Record<string, unknown>,
    area: StorageArea = 'local',
  ): Promise<Record<string, unknown>> {
    let keyList: string[] | null = null;
    let defaults: Record<string, unknown> = {};

    if (keys === undefined || keys === null) {
      keyList = null;
    } else if (typeof keys === 'string') {
      keyList = [keys];
    } else if (Array.isArray(keys)) {
      keyList = keys;
    } else {
      keyList = Object.keys(keys);
      defaults = keys;
    }

    const result = extStorageGet(extensionId, area, keyList);

    // Apply defaults for missing keys
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in result)) {
        result[k] = v;
      }
    }

    return result;
  }

  /**
   * chrome.storage.local.set / chrome.storage.sync.set
   */
  async set(
    extensionId: string,
    items: Record<string, unknown>,
    area: StorageArea = 'local',
  ): Promise<void> {
    extStorageSet(extensionId, area, items);
  }

  /**
   * chrome.storage.local.remove / chrome.storage.sync.remove
   */
  async remove(
    extensionId: string,
    keys: string | string[],
    area: StorageArea = 'local',
  ): Promise<void> {
    const keyList = typeof keys === 'string' ? [keys] : keys;
    extStorageRemove(extensionId, area, keyList);
  }

  /**
   * chrome.storage.local.clear / chrome.storage.sync.clear
   */
  async clear(extensionId: string, area: StorageArea = 'local'): Promise<void> {
    extStorageClear(extensionId, area);
  }
}
