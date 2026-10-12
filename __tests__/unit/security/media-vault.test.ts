import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Vault } from '../../../core/security/vault';
import { MediaVault, VaultLockedError, MEDIA_FILE_EXT } from '../../../src/main/security/media-vault';

const PASS = 'my-secure-passphrase-123';
const MARKER = 'PLAINTEXT-MARKER-';
const plaintext = Buffer.from(MARKER.repeat(64));

function fastVault(): Vault {
  return new Vault({ kdf: { algorithm: 'argon2id', memoryCost: 1024, timeCost: 1, parallelism: 1 } });
}

describe('MediaVault', () => {
  let dir: string;
  let vault: Vault;
  let media: MediaVault;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'volary-media-'));
    vault = fastVault();
    await vault.initialize(PASS);
    media = new MediaVault(vault, dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('round-trips a file through save, list and read', async () => {
    const entry = await media.save({ name: 'cat.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext, sourceUrl: 'https://example.com/cat.jpg' });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.name).toBe('cat.jpg');
    expect(entry.size).toBe(plaintext.length);

    const list = await media.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: entry.id, name: 'cat.jpg', type: 'image', mime: 'image/jpeg', size: plaintext.length });

    const { entry: read, bytes } = await media.read(entry.id);
    expect(read.name).toBe('cat.jpg');
    expect(bytes.equals(plaintext)).toBe(true);
  });

  it('writes only ciphertext under an opaque filename', async () => {
    const entry = await media.save({ name: 'secret-photo.png', type: 'image', mime: 'image/png', bytes: plaintext });
    const files = await fs.readdir(dir);
    expect(files).toEqual([`${entry.id}${MEDIA_FILE_EXT}`]);

    const onDisk = await fs.readFile(path.join(dir, files[0]));
    expect(onDisk.includes(Buffer.from(MARKER))).toBe(false);
    expect(onDisk.includes(Buffer.from('secret-photo'))).toBe(false);
    expect(onDisk.includes(Buffer.from('image/png'))).toBe(false);
    const mode = (await fs.stat(path.join(dir, files[0]))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('refuses every operation while the vault is locked', async () => {
    const entry = await media.save({ name: 'a.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext });
    vault.lock();
    await expect(media.save({ name: 'b.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext })).rejects.toBeInstanceOf(VaultLockedError);
    await expect(media.list()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(media.read(entry.id)).rejects.toBeInstanceOf(VaultLockedError);
    await expect(media.migrateLegacy()).rejects.toBeInstanceOf(VaultLockedError);
    // Nothing was written while locked
    expect(await fs.readdir(dir)).toHaveLength(1);
  });

  it('reads media again after lock and unlock with the passphrase', async () => {
    const entry = await media.save({ name: 'a.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext });
    vault.lock();
    expect(await vault.unlock(PASS)).toBe(true);
    const { bytes } = await media.read(entry.id);
    expect(bytes.equals(plaintext)).toBe(true);
  });

  it('cannot be read by a fresh vault with a different passphrase', async () => {
    const entry = await media.save({ name: 'a.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext });
    const other = fastVault();
    await other.initialize('a-totally-different-passphrase');
    const otherMedia = new MediaVault(other, dir);
    await expect(otherMedia.read(entry.id)).rejects.toThrow();
    // list() skips files it cannot open instead of failing wholesale
    expect(await otherMedia.list()).toEqual([]);
  });

  it('rejects a tampered file', async () => {
    const entry = await media.save({ name: 'a.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext });
    const file = path.join(dir, `${entry.id}${MEDIA_FILE_EXT}`);
    const buf = await fs.readFile(file);
    buf[buf.length - 10] ^= 0xff;
    await fs.writeFile(file, buf);
    await expect(media.read(entry.id)).rejects.toThrow();
  });

  it('deletes by id and rejects ids that are not UUIDs', async () => {
    const entry = await media.save({ name: 'a.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext });
    expect(await media.delete(entry.id)).toBe(true);
    expect(await fs.readdir(dir)).toEqual([]);
    expect(await media.delete(entry.id)).toBe(false);
    await expect(media.read('../../etc/passwd')).rejects.toThrow(/id/i);
    await expect(media.delete('not-a-uuid')).rejects.toThrow(/id/i);
  });

  it('encrypts legacy plaintext files in place and removes the originals', async () => {
    await fs.writeFile(path.join(dir, 'holiday-1776277564462.jpg'), plaintext);
    await fs.writeFile(path.join(dir, 'clip-123.mp4'), plaintext);
    await fs.writeFile(path.join(dir, '.DS_Store'), Buffer.from('finder junk'));

    expect(await media.migrateLegacy()).toBe(2);

    const files = await fs.readdir(dir);
    expect(files.filter((f) => f.endsWith(MEDIA_FILE_EXT))).toHaveLength(2);
    expect(files).not.toContain('holiday-1776277564462.jpg');
    expect(files).not.toContain('clip-123.mp4');
    expect(files).toContain('.DS_Store');

    const list = await media.list();
    expect(list.map((e) => [e.name, e.type, e.mime]).sort()).toEqual([
      ['clip-123.mp4', 'video', 'video/mp4'],
      ['holiday-1776277564462.jpg', 'image', 'image/jpeg'],
    ]);
    const migrated = list.find((e) => e.name === 'clip-123.mp4')!;
    expect((await media.read(migrated.id)).bytes.equals(plaintext)).toBe(true);

    expect(await media.migrateLegacy()).toBe(0);
  });

  it('exports a decrypted copy to a chosen path', async () => {
    const entry = await media.save({ name: 'a.jpg', type: 'image', mime: 'image/jpeg', bytes: plaintext });
    const dest = path.join(dir, '..', `volary-export-${Date.now()}.jpg`);
    try {
      await media.exportTo(entry.id, dest);
      expect((await fs.readFile(dest)).equals(plaintext)).toBe(true);
    } finally {
      await fs.rm(dest, { force: true });
    }
  });
});
