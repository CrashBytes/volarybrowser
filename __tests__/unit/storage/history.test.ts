import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../../core/storage/database';
import {
  addVisit, searchHistory, getRecentHistory,
  deleteAllHistory, deleteHistoryEntry, deleteHistoryRange,
} from '../../../core/storage/repositories/history';

describe('History Repository', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'volary-test-'));
    initDatabase(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return empty for no history', () => {
    expect(getRecentHistory()).toEqual([]);
  });

  it('should record and retrieve visits', () => {
    addVisit('https://example.com', 'Example');
    addVisit('https://test.com', 'Test');

    const recent = getRecentHistory();
    expect(recent).toHaveLength(2);
    // Both may share the same second-precision timestamp; just check both exist
    const urls = recent.map(r => r.url);
    expect(urls).toContain('https://example.com');
    expect(urls).toContain('https://test.com');
  });

  it('should search by URL', () => {
    addVisit('https://example.com', 'Example');
    addVisit('https://test.com', 'Test');

    const results = searchHistory('example');
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com');
  });

  it('should search by title', () => {
    addVisit('https://foo.com', 'My Awesome Page');

    const results = searchHistory('Awesome');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('My Awesome Page');
  });

  it('should delete a single entry', () => {
    addVisit('https://example.com', 'Example');
    const recent = getRecentHistory();
    deleteHistoryEntry(recent[0].id);
    expect(getRecentHistory()).toHaveLength(0);
  });

  it('should clear all history', () => {
    addVisit('https://a.com', 'A');
    addVisit('https://b.com', 'B');
    deleteAllHistory();
    expect(getRecentHistory()).toHaveLength(0);
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      addVisit(`https://${i}.com`, `Site ${i}`);
    }
    expect(getRecentHistory(3)).toHaveLength(3);
  });
});
