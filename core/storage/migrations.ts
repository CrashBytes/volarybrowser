/**
 * Database Migrations
 *
 * Versioned schema migrations that run on startup.
 * Each migration runs inside a transaction for atomicity.
 *
 * @module core/storage/migrations
 */

import type Database from 'better-sqlite3-multiple-ciphers';

interface Migration {
  version: number;
  description: string;
  up: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial schema: window state and key-value settings',
    up: `
      CREATE TABLE IF NOT EXISTS window_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        is_maximized INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `,
  },
  {
    version: 2,
    description: 'History and bookmarks',
    up: `
      CREATE TABLE IF NOT EXISTS history_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        visit_time INTEGER NOT NULL DEFAULT (unixepoch()),
        transition_type TEXT NOT NULL DEFAULT 'link'
      );
      CREATE INDEX IF NOT EXISTS idx_history_url ON history_visits(url);
      CREATE INDEX IF NOT EXISTS idx_history_visit_time ON history_visits(visit_time DESC);

      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER REFERENCES bookmarks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        url TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        is_folder INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_parent ON bookmarks(parent_id);

      INSERT INTO bookmarks (id, parent_id, title, url, is_folder) VALUES (1, NULL, 'Bookmarks Bar', NULL, 1);
      INSERT INTO bookmarks (id, parent_id, title, url, is_folder) VALUES (2, NULL, 'Other Bookmarks', NULL, 1);
    `,
  },
  {
    version: 3,
    description: 'Site permissions',
    up: `
      CREATE TABLE IF NOT EXISTS site_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        permission TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(origin, permission)
      );
      CREATE INDEX IF NOT EXISTS idx_permissions_origin ON site_permissions(origin);
    `,
  },
  {
    version: 4,
    description: 'Extension storage',
    up: `
      CREATE TABLE IF NOT EXISTS extension_storage (
        extension_id TEXT NOT NULL,
        area TEXT NOT NULL DEFAULT 'local',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (extension_id, area, key)
      );
      CREATE INDEX IF NOT EXISTS idx_ext_storage_ext ON extension_storage(extension_id, area);
    `,
  },
  {
    version: 5,
    description: 'Session recovery',
    up: `
      CREATE TABLE IF NOT EXISTS open_tabs (
        tab_id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `,
  },
  {
    version: 6,
    description: 'Named sessions for tab group save/restore',
    up: `
      CREATE TABLE IF NOT EXISTS saved_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS saved_session_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES saved_sessions(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
];

/**
 * Run all pending migrations
 *
 * Tracks applied migrations in a _migrations table.
 * Each migration runs in a transaction — if it fails, it rolls back.
 */
export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const currentVersion = db.prepare(
    'SELECT COALESCE(MAX(version), 0) as version FROM _migrations'
  ).get() as { version: number };

  for (const migration of migrations) {
    if (migration.version <= currentVersion.version) continue;

    const transaction = db.transaction(() => {
      db.exec(migration.up);
      db.prepare(
        'INSERT INTO _migrations (version, description) VALUES (?, ?)'
      ).run(migration.version, migration.description);
    });

    transaction();
  }
}
