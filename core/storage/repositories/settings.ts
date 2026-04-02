/**
 * Settings Repository
 *
 * Key-value store for user preferences, persisted to SQLite.
 *
 * @module core/storage/repositories/settings
 */

import { getDatabase } from '../database';

/**
 * Get a setting value by key
 *
 * @returns The stored value (JSON-parsed), or the default if not found
 */
export function getSetting<T>(key: string, defaultValue: T): T {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).get(key) as { value: string } | undefined;

  if (!row) return defaultValue;

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a setting value
 *
 * Values are JSON-serialized before storage.
 */
export function setSetting<T>(key: string, value: T): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = unixepoch()
  `).run(key, JSON.stringify(value));
}

/**
 * Delete a setting
 */
export function deleteSetting(key: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

/**
 * Get all settings as a record
 */
export function getAllSettings(): Record<string, unknown> {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}
