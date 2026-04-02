/**
 * Sessions Repository
 *
 * Save and restore named tab groups.
 *
 * @module core/storage/repositories/sessions
 */

import { getDatabase } from '../database';

export interface SavedSession {
  id: number;
  name: string;
  createdAt: number;
  tabs: Array<{ url: string; title: string; position: number }>;
}

/**
 * Save a session (group of tabs) with a name
 */
export function saveSession(name: string, tabs: Array<{ url: string; title: string }>): number {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO saved_sessions (name) VALUES (?)'
  ).run(name);

  const sessionId = Number(result.lastInsertRowid);
  const stmt = db.prepare(
    'INSERT INTO saved_session_tabs (session_id, url, title, position) VALUES (?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    tabs.forEach((tab, i) => {
      if (tab.url) stmt.run(sessionId, tab.url, tab.title, i);
    });
  });
  transaction();

  return sessionId;
}

/**
 * Get all saved sessions (without tabs)
 */
export function listSessions(): Array<{ id: number; name: string; createdAt: number; tabCount: number }> {
  const db = getDatabase();
  return db.prepare(`
    SELECT s.id, s.name, s.created_at, COUNT(t.id) as tab_count
    FROM saved_sessions s
    LEFT JOIN saved_session_tabs t ON t.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all() as Array<{ id: number; name: string; created_at: number; tab_count: number }>;
}

/**
 * Get a session with its tabs
 */
export function getSession(id: number): SavedSession | null {
  const db = getDatabase();
  const session = db.prepare(
    'SELECT id, name, created_at FROM saved_sessions WHERE id = ?'
  ).get(id) as { id: number; name: string; created_at: number } | undefined;

  if (!session) return null;

  const tabs = db.prepare(
    'SELECT url, title, position FROM saved_session_tabs WHERE session_id = ? ORDER BY position'
  ).all(id) as Array<{ url: string; title: string; position: number }>;

  return {
    id: session.id,
    name: session.name,
    createdAt: session.created_at,
    tabs,
  };
}

/**
 * Delete a saved session
 */
export function deleteSession(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM saved_sessions WHERE id = ?').run(id);
}
