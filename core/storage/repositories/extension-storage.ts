/**
 * Extension Storage Repository
 *
 * Persistent key-value storage for extensions, backing chrome.storage.local/sync.
 * Data is JSON-serialized per key, isolated per extension and area.
 *
 * @module core/storage/repositories/extension-storage
 */

import { getDatabase } from '../database';

type StorageArea = 'local' | 'sync';

/**
 * Get values from extension storage
 */
export function extStorageGet(
  extensionId: string,
  area: StorageArea,
  keys?: string[] | null
): Record<string, unknown> {
  const db = getDatabase();
  const result: Record<string, unknown> = {};

  if (!keys) {
    // Get all
    const rows = db.prepare(
      'SELECT key, value FROM extension_storage WHERE extension_id = ? AND area = ?'
    ).all(extensionId, area) as Array<{ key: string; value: string }>;
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    }
  } else {
    for (const key of keys) {
      const row = db.prepare(
        'SELECT value FROM extension_storage WHERE extension_id = ? AND area = ? AND key = ?'
      ).get(extensionId, area, key) as { value: string } | undefined;
      if (row) {
        try { result[key] = JSON.parse(row.value); } catch { result[key] = row.value; }
      }
    }
  }

  return result;
}

/**
 * Set values in extension storage
 */
export function extStorageSet(
  extensionId: string,
  area: StorageArea,
  items: Record<string, unknown>
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO extension_storage (extension_id, area, key, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(extension_id, area, key) DO UPDATE SET value = excluded.value
  `);

  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(items)) {
      stmt.run(extensionId, area, key, JSON.stringify(value));
    }
  });
  transaction();
}

/**
 * Remove keys from extension storage
 */
export function extStorageRemove(
  extensionId: string,
  area: StorageArea,
  keys: string[]
): void {
  const db = getDatabase();
  const stmt = db.prepare(
    'DELETE FROM extension_storage WHERE extension_id = ? AND area = ? AND key = ?'
  );
  const transaction = db.transaction(() => {
    for (const key of keys) {
      stmt.run(extensionId, area, key);
    }
  });
  transaction();
}

/**
 * Clear all storage for an extension in a given area
 */
export function extStorageClear(extensionId: string, area: StorageArea): void {
  const db = getDatabase();
  db.prepare(
    'DELETE FROM extension_storage WHERE extension_id = ? AND area = ?'
  ).run(extensionId, area);
}

/**
 * Clear ALL storage for an extension (both local and sync)
 */
export function extStorageClearAll(extensionId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM extension_storage WHERE extension_id = ?').run(extensionId);
}
