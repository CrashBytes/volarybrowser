/**
 * Database Manager - Encrypted SQLite persistence layer
 *
 * Uses better-sqlite3-multiple-ciphers (SQLCipher) for full database
 * encryption. Every byte on disk is encrypted with AES-256-CBC via
 * SQLCipher's page-level encryption.
 *
 * The encryption key is derived from the vault password. The database
 * cannot be read without unlocking the vault first.
 *
 * @module core/storage/database
 */

import Database from 'better-sqlite3-multiple-ciphers';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;
let dbPath: string = '';

/**
 * Initialize the database connection with SQLCipher encryption
 *
 * @param userDataPath - Path to the user data directory
 * @param encryptionKey - Hex-encoded 32-byte key for SQLCipher. If not provided,
 *                        uses a device-local key (generated on first run).
 */
export function initDatabase(userDataPath: string, encryptionKey?: string): Database.Database {
  if (db) return db;

  dbPath = path.join(userDataPath, 'volary.db');

  // Determine the encryption key
  const key = encryptionKey || getOrCreateLocalKey(userDataPath);

  db = new Database(dbPath);

  // Configure SQLCipher encryption
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`legacy=4`);
  db.pragma(`key='${key}'`);

  // Verify the key works (will throw if wrong key)
  try {
    db.pragma('journal_mode = WAL');
  } catch {
    // Key is wrong or DB is corrupted — if this is a new DB, it's fine
    // If it's an existing unencrypted DB, we need to migrate it
    db.close();
    db = null;

    if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
      // Existing unencrypted DB — migrate to encrypted
      migrateToEncrypted(dbPath, key);
      db = new Database(dbPath);
      db.pragma(`cipher='sqlcipher'`);
      db.pragma(`legacy=4`);
      db.pragma(`key='${key}'`);
      db.pragma('journal_mode = WAL');
    } else {
      // New DB — just reopen with key
      db = new Database(dbPath);
      db.pragma(`cipher='sqlcipher'`);
      db.pragma(`legacy=4`);
      db.pragma(`key='${key}'`);
      db.pragma('journal_mode = WAL');
    }
  }

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Get the active database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get or create a device-local encryption key.
 * This key is stored in a separate file with restrictive permissions.
 * It provides encryption-at-rest even without vault setup.
 */
function getOrCreateLocalKey(userDataPath: string): string {
  const keyPath = path.join(userDataPath, '.db-key');

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8').trim();
  }

  // Generate a random 32-byte key (256-bit)
  const key = crypto.randomBytes(32).toString('hex');

  // Write with restrictive permissions (owner-only read/write)
  fs.writeFileSync(keyPath, key, { mode: 0o600 });

  return key;
}

/**
 * Migrate an existing unencrypted database to SQLCipher encrypted format.
 * Creates a new encrypted copy and replaces the original.
 */
function migrateToEncrypted(originalPath: string, key: string): void {
  const tempPath = originalPath + '.encrypting';

  try {
    // Open the unencrypted original
    const plainDb = new Database(originalPath);

    // Attach a new encrypted database
    plainDb.exec(`ATTACH DATABASE '${tempPath}' AS encrypted KEY '${key}'`);
    plainDb.exec(`SELECT sqlcipher_export('encrypted')`);
    plainDb.exec(`DETACH DATABASE encrypted`);
    plainDb.close();

    // Replace original with encrypted version
    fs.renameSync(tempPath, originalPath);

    // Clean up WAL/SHM files from the old unencrypted DB
    for (const ext of ['-wal', '-shm']) {
      const walPath = originalPath + ext;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    }
  } catch (error) {
    // Clean up temp file on failure
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }
}
