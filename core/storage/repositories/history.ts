/**
 * History Repository
 *
 * Stores and queries browsing history visits.
 *
 * @module core/storage/repositories/history
 */

import { getDatabase } from '../database';

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  visitTime: number;
  transitionType: string;
}

/**
 * Record a page visit
 */
export function addVisit(url: string, title: string, transitionType = 'link'): void {
  const db = getDatabase();
  db.prepare(
    'INSERT INTO history_visits (url, title, transition_type) VALUES (?, ?, ?)'
  ).run(url, title, transitionType);
}

/**
 * Search history by URL or title substring
 */
export function searchHistory(query: string, limit = 50): HistoryEntry[] {
  const db = getDatabase();
  const pattern = `%${query}%`;
  const rows = db.prepare(`
    SELECT id, url, title, visit_time, transition_type
    FROM history_visits
    WHERE url LIKE ? OR title LIKE ?
    ORDER BY visit_time DESC
    LIMIT ?
  `).all(pattern, pattern, limit) as Array<{
    id: number; url: string; title: string; visit_time: number; transition_type: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    url: r.url,
    title: r.title,
    visitTime: r.visit_time,
    transitionType: r.transition_type,
  }));
}

/**
 * Get recent history entries
 */
export function getRecentHistory(limit = 100): HistoryEntry[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, url, title, visit_time, transition_type
    FROM history_visits
    ORDER BY visit_time DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number; url: string; title: string; visit_time: number; transition_type: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    url: r.url,
    title: r.title,
    visitTime: r.visit_time,
    transitionType: r.transition_type,
  }));
}

/**
 * Delete history in a time range
 */
export function deleteHistoryRange(startTime: number, endTime: number): number {
  const db = getDatabase();
  const result = db.prepare(
    'DELETE FROM history_visits WHERE visit_time >= ? AND visit_time <= ?'
  ).run(startTime, endTime);
  return result.changes;
}

/**
 * Delete all history
 */
export function deleteAllHistory(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM history_visits').run();
}

/**
 * Delete a single history entry
 */
export function deleteHistoryEntry(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM history_visits WHERE id = ?').run(id);
}
