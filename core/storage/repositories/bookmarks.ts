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

  // Idempotency: for URL bookmarks, return the existing row if the same URL is
  // already bookmarked. Prevents duplicates when the same toggle fires from
  // multiple sources (star button + Cmd+D) before React state catches up.
  if (!isFolder && url) {
    const existing = db.prepare(
      'SELECT id FROM bookmarks WHERE url = ? AND is_folder = 0 LIMIT 1'
    ).get(url) as { id: number } | undefined;
    if (existing) return existing.id;
  }

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
  // Root folders stay put.
  if (id <= 2) return;

  const item = db.prepare('SELECT id, parent_id FROM bookmarks WHERE id = ?')
    .get(id) as { id: number; parent_id: number | null } | undefined;
  const target = db.prepare('SELECT id, is_folder FROM bookmarks WHERE id = ?')
    .get(newParentId) as { id: number; is_folder: number } | undefined;
  if (!item || !target || target.is_folder !== 1) return;

  // A folder can't go inside itself or one of its descendants: the subtree
  // would detach from the roots and disappear from every view.
  let cursor: number | null = newParentId;
  while (cursor !== null) {
    if (cursor === id) return;
    const row = db.prepare('SELECT parent_id FROM bookmarks WHERE id = ?')
      .get(cursor) as { parent_id: number | null } | undefined;
    cursor = row?.parent_id ?? null;
  }

  const siblingIds = (parentId: number): number[] =>
    (db.prepare('SELECT id FROM bookmarks WHERE parent_id = ? ORDER BY position, id')
      .all(parentId) as { id: number }[]).map(r => r.id);
  const renumber = db.prepare('UPDATE bookmarks SET parent_id = ?, position = ? WHERE id = ?');

  db.transaction(() => {
    // newPosition means "before the item currently at that index" in the
    // target folder, which is what drag-and-drop targets report. Moving down
    // within the same folder shifts that index by one once the item is lifted.
    const target = siblingIds(newParentId);
    const oldIndex = item.parent_id === newParentId ? target.indexOf(id) : -1;
    let index = Math.max(0, Math.floor(newPosition));
    if (oldIndex !== -1 && oldIndex < index) index -= 1;

    const remaining = target.filter(x => x !== id);
    remaining.splice(Math.min(index, remaining.length), 0, id);
    remaining.forEach((x, pos) => renumber.run(newParentId, pos, x));

    if (item.parent_id !== null && item.parent_id !== newParentId) {
      siblingIds(item.parent_id).forEach((x, pos) => renumber.run(item.parent_id, pos, x));
    }
  })();
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
