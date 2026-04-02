/**
 * Window State Repository
 *
 * Persists and retrieves window position/size across sessions.
 *
 * @module core/storage/repositories/window-state
 */

import { getDatabase } from '../database';

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/**
 * Save window state to the database
 */
export function saveWindowState(state: WindowState): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO window_state (id, x, y, width, height, is_maximized, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      x = excluded.x,
      y = excluded.y,
      width = excluded.width,
      height = excluded.height,
      is_maximized = excluded.is_maximized,
      updated_at = unixepoch()
  `).run(state.x, state.y, state.width, state.height, state.isMaximized ? 1 : 0);
}

/**
 * Load window state from the database
 *
 * @returns The saved window state, or null if none exists
 */
export function loadWindowState(): WindowState | null {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT x, y, width, height, is_maximized FROM window_state WHERE id = 1'
  ).get() as { x: number; y: number; width: number; height: number; is_maximized: number } | undefined;

  if (!row) return null;

  return {
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    isMaximized: row.is_maximized === 1,
  };
}
