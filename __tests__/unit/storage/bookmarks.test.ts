import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../../core/storage/database';
import {
  createBookmark, deleteBookmark, updateBookmark, moveBookmark,
  getChildren, getBookmarkTree, isBookmarked, searchBookmarks,
} from '../../../core/storage/repositories/bookmarks';

describe('Bookmarks Repository', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'volary-test-'));
    initDatabase(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should have root folders after migration', () => {
    const tree = getBookmarkTree(1);
    expect(tree).not.toBeNull();
    expect(tree!.title).toBe('Bookmarks Bar');
    expect(tree!.isFolder).toBe(true);
  });

  it('should create a bookmark', () => {
    const id = createBookmark(1, 'Example', 'https://example.com');
    expect(id).toBeGreaterThan(2); // Root folders are 1 and 2

    const children = getChildren(1);
    expect(children).toHaveLength(1);
    expect(children[0].title).toBe('Example');
    expect(children[0].url).toBe('https://example.com');
  });

  it('should auto-increment position', () => {
    createBookmark(1, 'First', 'https://first.com');
    createBookmark(1, 'Second', 'https://second.com');

    const children = getChildren(1);
    expect(children[0].position).toBe(0);
    expect(children[1].position).toBe(1);
  });

  it('should create folders', () => {
    const folderId = createBookmark(1, 'Work', null, true);
    createBookmark(folderId, 'Docs', 'https://docs.com');

    const tree = getBookmarkTree(1);
    expect(tree!.children).toHaveLength(1);
    expect(tree!.children![0].isFolder).toBe(true);
    expect(tree!.children![0].children).toHaveLength(1);
    expect(tree!.children![0].children![0].title).toBe('Docs');
  });

  it('should delete a bookmark', () => {
    const id = createBookmark(1, 'ToDelete', 'https://delete.me');
    deleteBookmark(id);
    expect(getChildren(1)).toHaveLength(0);
  });

  it('should not delete root folders', () => {
    deleteBookmark(1);
    expect(getBookmarkTree(1)).not.toBeNull();
  });

  it('should update a bookmark', () => {
    const id = createBookmark(1, 'Old', 'https://old.com');
    updateBookmark(id, 'New', 'https://new.com');

    const children = getChildren(1);
    expect(children[0].title).toBe('New');
    expect(children[0].url).toBe('https://new.com');
  });

  it('should check if URL is bookmarked', () => {
    createBookmark(1, 'Test', 'https://test.com');
    expect(isBookmarked('https://test.com')).not.toBeNull();
    expect(isBookmarked('https://other.com')).toBeNull();
  });

  it('should search bookmarks', () => {
    createBookmark(1, 'GitHub', 'https://github.com');
    createBookmark(1, 'GitLab', 'https://gitlab.com');
    createBookmark(1, 'Other', 'https://other.com');

    const results = searchBookmarks('git');
    expect(results).toHaveLength(2);
  });

  it('should move a bookmark', () => {
    const id = createBookmark(1, 'Movable', 'https://move.me');
    moveBookmark(id, 2, 0); // Move to "Other Bookmarks"

    expect(getChildren(1)).toHaveLength(0);
    expect(getChildren(2)).toHaveLength(1);
  });
});
