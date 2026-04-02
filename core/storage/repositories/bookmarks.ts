/**
 * Bookmarks Repository
 *
 * Tree-structured bookmarks with folders and items.
 * Root folders: "Bookmarks Bar" (id=1), "Other Bookmarks" (id=2)
 *
 * @module core/storage/repositories/bookmarks
 */

import { getDatabase } from '../database';

export interface Bookmark {
  id: number;
  parentId: number | null;
  title: string;
  url: string | null;
  position: number;
  isFolder: boolean;
  createdAt: number;
  children?: Bookmark[];
}

interface BookmarkRow {
  id: number;
  parent_id: number | null;
  title: string;
  url: string | null;
  position: number;
  is_folder: number;
  created_at: number;
}

function rowToBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    url: row.url,
    position: row.position,
    isFolder: row.is_folder === 1,
    createdAt: row.created_at,
  };
}

/**
 * Create a new bookmark
 */
export function createBookmark(parentId: number, title: string, url: string | null, isFolder = false): number {
  const db = getDatabase();
  // Get next position
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) as max_pos FROM bookmarks WHERE parent_id = ?'
  ).get(parentId) as { max_pos: number };

  const result = db.prepare(
    'INSERT INTO bookmarks (parent_id, title, url, position, is_folder) VALUES (?, ?, ?, ?, ?)'
  ).run(parentId, title, url, maxPos.max_pos + 1, isFolder ? 1 : 0);

  return Number(result.lastInsertRowid);
}

/**
 * Delete a bookmark or folder (cascading)
 */
export function deleteBookmark(id: number): void {
  const db = getDatabase();
  // Don't allow deleting root folders
  if (id <= 2) return;
  db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
}

/**
 * Update bookmark title and/or URL
 */
export function updateBookmark(id: number, title?: string, url?: string): void {
  const db = getDatabase();
  if (title !== undefined && url !== undefined) {
    db.prepare('UPDATE bookmarks SET title = ?, url = ? WHERE id = ?').run(title, url, id);
  } else if (title !== undefined) {
    db.prepare('UPDATE bookmarks SET title = ? WHERE id = ?').run(title, id);
  } else if (url !== undefined) {
    db.prepare('UPDATE bookmarks SET url = ? WHERE id = ?').run(url, id);
  }
}

/**
 * Move a bookmark to a new parent and position
 */
export function moveBookmark(id: number, newParentId: number, newPosition: number): void {
  const db = getDatabase();
  db.prepare('UPDATE bookmarks SET parent_id = ?, position = ? WHERE id = ?').run(newParentId, newPosition, id);
}

/**
 * Get children of a folder
 */
export function getChildren(parentId: number): Bookmark[] {
  const db = getDatabase();
  const rows = db.prepare(
    'SELECT * FROM bookmarks WHERE parent_id = ? ORDER BY position'
  ).all(parentId) as BookmarkRow[];
  return rows.map(rowToBookmark);
}

/**
 * Get full bookmark tree from a root folder
 */
export function getBookmarkTree(rootId: number): Bookmark | null {
  const db = getDatabase();
  const rootRow = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(rootId) as BookmarkRow | undefined;
  if (!rootRow) return null;

  const root = rowToBookmark(rootRow);
  root.children = buildChildren(db, rootId);
  return root;
}

function buildChildren(db: ReturnType<typeof getDatabase>, parentId: number): Bookmark[] {
  const rows = db.prepare(
    'SELECT * FROM bookmarks WHERE parent_id = ? ORDER BY position'
  ).all(parentId) as BookmarkRow[];

  return rows.map(row => {
    const bm = rowToBookmark(row);
    if (bm.isFolder) {
      bm.children = buildChildren(db, bm.id);
    }
    return bm;
  });
}

/**
 * Check if a URL is bookmarked
 */
export function isBookmarked(url: string): Bookmark | null {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT * FROM bookmarks WHERE url = ? LIMIT 1'
  ).get(url) as BookmarkRow | undefined;
  return row ? rowToBookmark(row) : null;
}

/**
 * Search bookmarks by title or URL
 */
export function searchBookmarks(query: string, limit = 50): Bookmark[] {
  const db = getDatabase();
  const pattern = `%${query}%`;
  const rows = db.prepare(`
    SELECT * FROM bookmarks
    WHERE (title LIKE ? OR url LIKE ?) AND is_folder = 0
    ORDER BY created_at DESC
    LIMIT ?
  `).all(pattern, pattern, limit) as BookmarkRow[];
  return rows.map(rowToBookmark);
}
