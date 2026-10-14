/**
 * Media Vault - encrypted at-rest storage for media saved from web pages
 *
 * Every file lives under the vault directory as `<uuid>.vmv`:
 *
 *   magic "VMV1" | u32be headerLen | header blob | body blob
 *
 * where each blob is `nonce(24) | authTag(16) | ciphertext`, produced by the
 * core Vault's XChaCha20-Poly1305 under the HKDF context "media". The header
 * (original name, kind, MIME type, size, source URL, timestamp) is encrypted
 * separately so listings only decrypt a few hundred bytes per file. The name
 * on disk carries no information about the content.
 *
 * Every operation requires the vault to be unlocked; plaintext never touches
 * disk except through an explicit export the user asked for.
 *
 * @module main/security/media-vault
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Vault, VaultStatus } from '../../../core/security/vault';
import { LoggerFactory } from '../utils/logger';
import { ILogger } from '../types';

export const MEDIA_FILE_EXT = '.vmv';
const MAGIC = Buffer.from('VMV1');
const CONTEXT = 'media';
const NONCE_LEN = 24;
const TAG_LEN = 16;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HEADER = 64 * 1024;

export type MediaKind = 'image' | 'video' | 'audio';

export interface MediaEntry {
  id: string;
  name: string;
  type: MediaKind;
  mime: string;
  size: number;
  savedAt: number;
  sourceUrl?: string;
}

export interface MediaSaveInput {
  name: string;
  type: MediaKind;
  mime: string;
  bytes: Buffer;
  sourceUrl?: string;
}

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked');
    this.name = 'VaultLockedError';
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg',
  '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/opus',
};

/** Guess kind + MIME from a filename; used for legacy files and as a fallback. */
export function guessMedia(name: string): { type: MediaKind; mime: string } {
  const ext = path.extname(name).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  const type: MediaKind = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image';
  return { type, mime };
}

export class MediaVault {
  private logger: ILogger;

  constructor(private vault: Vault, private dir: string) {
    this.logger = LoggerFactory.create('MediaVault');
  }

  getDirectory(): string {
    return this.dir;
  }

  isUnlocked(): boolean {
    return this.vault.getStatus() === VaultStatus.UNLOCKED;
  }

  /** Encrypt and store a media file. */
  async save(input: MediaSaveInput): Promise<MediaEntry> {
    this.ensureUnlocked();
    await this.ensureDir();

    const entry: MediaEntry = {
      id: randomUUID(),
      name: sanitizeName(input.name),
      type: input.type,
      mime: input.mime,
      size: input.bytes.length,
      savedAt: Date.now(),
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    };

    const header = await this.seal(Buffer.from(JSON.stringify(entry), 'utf8'));
    const body = await this.seal(input.bytes);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(header.length, 0);

    const file = this.pathFor(entry.id);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, Buffer.concat([MAGIC, lenBuf, header, body]), { mode: 0o600 });
    await fs.rename(tmp, file);

    this.logger.info('Media stored', { id: entry.id, type: entry.type, size: entry.size });
    return entry;
  }

  /** List stored media, newest first. Files that cannot be opened are skipped. */
  async list(): Promise<MediaEntry[]> {
    this.ensureUnlocked();
    await this.ensureDir();

    const entries: MediaEntry[] = [];
    for (const file of await fs.readdir(this.dir)) {
      if (!file.endsWith(MEDIA_FILE_EXT)) continue;
      const id = file.slice(0, -MEDIA_FILE_EXT.length);
      if (!UUID_RE.test(id)) continue;
      try {
        entries.push(await this.readHeader(id));
      } catch (error) {
        this.logger.warn('Skipping unreadable media file', { file, error: (error as Error).message });
      }
    }
    return entries.sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Decrypt one media file fully. */
  async read(id: string): Promise<{ entry: MediaEntry; bytes: Buffer }> {
    this.ensureUnlocked();
    assertId(id);
    const buf = await fs.readFile(this.pathFor(id));
    const { headerLen } = parseFrame(buf);
    const entry = JSON.parse((await this.open(buf.subarray(8, 8 + headerLen))).toString('utf8')) as MediaEntry;
    const bytes = await this.open(buf.subarray(8 + headerLen));
    return { entry, bytes };
  }

  /** Remove a stored file. Returns false if it did not exist. */
  async delete(id: string): Promise<boolean> {
    assertId(id);
    try {
      await fs.unlink(this.pathFor(id));
      this.logger.info('Media deleted', { id });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  /** Write a decrypted copy to a path the user chose. */
  async exportTo(id: string, destPath: string): Promise<MediaEntry> {
    const { entry, bytes } = await this.read(id);
    await fs.writeFile(destPath, bytes, { mode: 0o600 });
    this.logger.info('Media exported', { id, destPath });
    return entry;
  }

  /**
   * Encrypt any plaintext files left in the media directory by the pre-vault
   * implementation, then remove the originals. Returns how many were migrated.
   */
  async migrateLegacy(): Promise<number> {
    this.ensureUnlocked();
    await this.ensureDir();

    let migrated = 0;
    for (const file of await fs.readdir(this.dir)) {
      if (file.startsWith('.') || file.endsWith(MEDIA_FILE_EXT) || file.endsWith('.tmp')) continue;
      const full = path.join(this.dir, file);
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        const bytes = await fs.readFile(full);
        const { type, mime } = guessMedia(file);
        const entry = await this.save({ name: file, type, mime, bytes });
        // Keep the original save time so the gallery order is preserved
        await this.rewriteSavedAt(entry, stat.mtimeMs);
        await fs.unlink(full);
        migrated++;
        this.logger.info('Legacy plaintext media encrypted', { file, id: entry.id });
      } catch (error) {
        this.logger.error('Failed to migrate legacy media file', error as Error, { file });
      }
    }
    return migrated;
  }

  // -- internals --

  private async rewriteSavedAt(entry: MediaEntry, savedAt: number): Promise<void> {
    const file = this.pathFor(entry.id);
    const buf = await fs.readFile(file);
    const { headerLen } = parseFrame(buf);
    const header = await this.seal(Buffer.from(JSON.stringify({ ...entry, savedAt }), 'utf8'));
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(header.length, 0);
    await fs.writeFile(file, Buffer.concat([MAGIC, lenBuf, header, buf.subarray(8 + headerLen)]), { mode: 0o600 });
  }

  private async readHeader(id: string): Promise<MediaEntry> {
    const fh = await fs.open(this.pathFor(id), 'r');
    try {
      const head = Buffer.alloc(8);
      await fh.read(head, 0, 8, 0);
      const { headerLen } = parseFrame(head);
      const header = Buffer.alloc(headerLen);
      await fh.read(header, 0, headerLen, 8);
      const entry = JSON.parse((await this.open(header)).toString('utf8')) as MediaEntry;
      if (entry.id !== id) throw new Error('Header id does not match filename');
      return entry;
    } finally {
      await fh.close();
    }
  }

  private async seal(plain: Buffer): Promise<Buffer> {
    const enc = await this.vault.encrypt(plain, CONTEXT);
    return Buffer.concat([enc.nonce, enc.authTag, enc.ciphertext]);
  }

  private async open(blob: Buffer): Promise<Buffer> {
    if (blob.length < NONCE_LEN + TAG_LEN) throw new Error('Corrupt media blob');
    return this.vault.decrypt({
      nonce: Buffer.from(blob.subarray(0, NONCE_LEN)),
      authTag: Buffer.from(blob.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN)),
      ciphertext: Buffer.from(blob.subarray(NONCE_LEN + TAG_LEN)),
      metadata: { context: CONTEXT },
    });
  }

  private pathFor(id: string): string {
    return path.join(this.dir, `${id}${MEDIA_FILE_EXT}`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  private ensureUnlocked(): void {
    if (!this.isUnlocked()) throw new VaultLockedError();
  }
}

function assertId(id: string): void {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new Error('Invalid media id');
  }
}

function parseFrame(buf: Buffer): { headerLen: number } {
  if (buf.length < 8 || !buf.subarray(0, 4).equals(MAGIC)) {
    throw new Error('Not a Volary media file');
  }
  const headerLen = buf.readUInt32BE(4);
  if (headerLen < NONCE_LEN + TAG_LEN || headerLen > MAX_HEADER) {
    throw new Error('Corrupt media header');
  }
  return { headerLen };
}

function sanitizeName(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f]/g, '').trim();
  return base.length > 0 ? base.slice(0, 255) : `media-${Date.now()}`;
}
