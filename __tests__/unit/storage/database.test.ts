import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initDatabase, getDatabase, closeDatabase } from '../../../core/storage/database';

describe('Database', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'volary-test-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize the database', () => {
    const db = initDatabase(tempDir);
    expect(db).toBeDefined();
  });

  it('should return the same instance on repeated init', () => {
    const db1 = initDatabase(tempDir);
    const db2 = initDatabase(tempDir);
    expect(db1).toBe(db2);
  });

  it('should throw when getting database before init', () => {
    expect(() => getDatabase()).toThrow('Database not initialized');
  });

  it('should create the _migrations table', () => {
    initDatabase(tempDir);
    const db = getDatabase();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    ).get() as { name: string } | undefined;
    expect(tables?.name).toBe('_migrations');
  });

  it('should run migrations and create tables', () => {
    initDatabase(tempDir);
    const db = getDatabase();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('_migrations');
    expect(tableNames).toContain('window_state');
    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('history_visits');
    expect(tableNames).toContain('bookmarks');
  });

  it('should track migration versions', () => {
    initDatabase(tempDir);
    const db = getDatabase();
    const migration = db.prepare(
      'SELECT version, description FROM _migrations ORDER BY version'
    ).get() as { version: number; description: string };

    expect(migration.version).toBe(1);
    expect(migration.description).toContain('Initial schema');
  });

  it('should be idempotent (run migrations twice)', () => {
    initDatabase(tempDir);
    closeDatabase();

    // Re-initialize — should not error
    const db = initDatabase(tempDir);
    const count = db.prepare('SELECT COUNT(*) as c FROM _migrations').get() as { c: number };
    expect(count.c).toBe(5); // 5 migrations total
  });
});
