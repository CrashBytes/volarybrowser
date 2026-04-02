/**
 * Database Manager - SQLite persistence layer
 *
 * Provides a singleton database connection for all persistent storage.
 * Uses better-sqlite3 for synchronous, reliable SQLite access in the
 * Electron main process.
 *
 * @module core/storage/database
 */

import Database from 'better-sqlite3';
import path from 'path';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

/**
 * Initialize the database connection
 *
 * @param userDataPath - Path to the user data directory (e.g. app.getPath('userData'))
 * @returns The database instance
 */
export function initDatabase(userDataPath: string): Database.Database {
  if (db) return db;

  const dbPath = path.join(userDataPath, 'volary.db');

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Get the active database instance
 *
 * @throws {Error} If database has not been initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 * Should be called on application shutdown
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
