/**
 * chrome.storage API Implementation
 *
 * Per-extension isolated storage. Currently in-memory only;
 * disk persistence will be added in Phase 2.
 *
 * @module extensions/api/storage
 */

export class StorageAPI {
  private stores: Map<string, Map<string, unknown>> = new Map();

  private getStore(extensionId: string): Map<string, unknown> {
    if (!this.stores.has(extensionId)) {
      this.stores.set(extensionId, new Map());
    }
    return this.stores.get(extensionId)!;
  }

  /**
   * chrome.storage.local.get
   */
  async get(
    extensionId: string,
    keys?: string | string[] | Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const store = this.getStore(extensionId);
    const result: Record<string, unknown> = {};

    if (keys === undefined || keys === null) {
      for (const [k, v] of store) {
        result[k] = v;
      }
    } else if (typeof keys === 'string') {
      const val = store.get(keys);
      if (val !== undefined) result[keys] = val;
    } else if (Array.isArray(keys)) {
      for (const k of keys) {
        const val = store.get(k);
        if (val !== undefined) result[k] = val;
      }
    } else {
      for (const [k, defaultVal] of Object.entries(keys)) {
        const val = store.get(k);
        result[k] = val !== undefined ? val : defaultVal;
      }
    }

    return result;
  }

  /**
   * chrome.storage.local.set
   */
  async set(extensionId: string, items: Record<string, unknown>): Promise<void> {
    const store = this.getStore(extensionId);
    for (const [k, v] of Object.entries(items)) {
      store.set(k, v);
    }
  }

  /**
   * chrome.storage.local.remove
   */
  async remove(extensionId: string, keys: string | string[]): Promise<void> {
    const store = this.getStore(extensionId);
    const keyList = typeof keys === 'string' ? [keys] : keys;
    for (const k of keyList) {
      store.delete(k);
    }
  }

  /**
   * chrome.storage.local.clear
   */
  async clear(extensionId: string): Promise<void> {
    this.stores.delete(extensionId);
  }
}
