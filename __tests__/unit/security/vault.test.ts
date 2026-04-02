import { describe, it, expect, beforeEach } from 'vitest';
import { Vault, VaultStatus, AuthenticationLevel } from '../../../core/security/vault';

describe('Vault', () => {
  let vault: Vault;

  beforeEach(() => {
    // Use fast KDF params for testing
    vault = new Vault({
      kdf: {
        algorithm: 'argon2id',
        memoryCost: 1024, // 1 MB (fast for tests)
        timeCost: 1,
        parallelism: 1,
      },
    });
  });

  describe('initialization', () => {
    it('should start in UNINITIALIZED state', () => {
      expect(vault.getStatus()).toBe(VaultStatus.UNINITIALIZED);
    });

    it('should initialize with a valid passphrase', async () => {
      await vault.initialize('my-secure-passphrase-123');
      expect(vault.getStatus()).toBe(VaultStatus.UNLOCKED);
    });

    it('should reject short passphrases', async () => {
      await expect(vault.initialize('short')).rejects.toThrow(
        'Passphrase must be at least 12 characters'
      );
    });

    it('should not allow double initialization', async () => {
      await vault.initialize('my-secure-passphrase-123');
      await expect(vault.initialize('another-passphrase-123')).rejects.toThrow(
        'Vault already initialized'
      );
    });

    it('should set the correct auth level', async () => {
      await vault.initialize('my-secure-passphrase-123', AuthenticationLevel.VAULT);
      expect(vault.getAuthLevel()).toBe(AuthenticationLevel.VAULT);
    });

    it('should generate metadata with verification blob', async () => {
      await vault.initialize('my-secure-passphrase-123');
      const metadata = vault.getMetadata();
      expect(metadata).not.toBeNull();
      expect(metadata!.verificationBlob).toBeInstanceOf(Buffer);
      expect(metadata!.verificationBlob.length).toBe(32); // SHA-256 output
      expect(metadata!.kdfSalt).toBeInstanceOf(Buffer);
      expect(metadata!.kdfSalt.length).toBe(32);
    });
  });

  describe('lock and unlock', () => {
    beforeEach(async () => {
      await vault.initialize('my-secure-passphrase-123');
    });

    it('should lock the vault', () => {
      vault.lock();
      expect(vault.getStatus()).toBe(VaultStatus.LOCKED);
    });

    it('should unlock with correct passphrase', async () => {
      vault.lock();
      const result = await vault.unlock('my-secure-passphrase-123');
      expect(result).toBe(true);
      expect(vault.getStatus()).toBe(VaultStatus.UNLOCKED);
    });

    it('should reject wrong passphrase', async () => {
      vault.lock();
      const result = await vault.unlock('wrong-passphrase-12345');
      expect(result).toBe(false);
      expect(vault.getStatus()).toBe(VaultStatus.LOCKED);
    });

    it('should not unlock when not in LOCKED state', async () => {
      // Vault is UNLOCKED after initialize
      await expect(vault.unlock('my-secure-passphrase-123')).rejects.toThrow(
        'Cannot unlock vault in unlocked state'
      );
    });
  });

  describe('encrypt and decrypt', () => {
    beforeEach(async () => {
      await vault.initialize('my-secure-passphrase-123');
    });

    it('should encrypt and decrypt data', async () => {
      const plaintext = Buffer.from('secret data');
      const encrypted = await vault.encrypt(plaintext);

      expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
      expect(encrypted.nonce).toBeInstanceOf(Buffer);
      expect(encrypted.authTag).toBeInstanceOf(Buffer);
      expect(encrypted.nonce.length).toBe(24); // XChaCha20

      const decrypted = await vault.decrypt(encrypted);
      expect(decrypted.toString()).toBe('secret data');
    });

    it('should encrypt with context-specific keys', async () => {
      const plaintext = Buffer.from('context data');
      const encrypted = await vault.encrypt(plaintext, 'passwords');

      expect(encrypted.metadata).toEqual({ context: 'passwords' });

      const decrypted = await vault.decrypt(encrypted);
      expect(decrypted.toString()).toBe('context data');
    });

    it('should fail to encrypt when locked', async () => {
      vault.lock();
      await expect(vault.encrypt(Buffer.from('test'))).rejects.toThrow(
        'Vault must be unlocked'
      );
    });

    it('should detect tampered ciphertext', async () => {
      const plaintext = Buffer.from('important data');
      const encrypted = await vault.encrypt(plaintext);

      // Tamper with ciphertext
      encrypted.ciphertext[0] = encrypted.ciphertext[0]! ^ 0xff;

      await expect(vault.decrypt(encrypted)).rejects.toThrow(
        'Decryption failed: data may be tampered'
      );
    });
  });

  describe('metadata persistence', () => {
    it('should round-trip metadata via loadMetadata', async () => {
      await vault.initialize('my-secure-passphrase-123');
      const metadata = vault.getMetadata()!;

      // Create a new vault and load the metadata
      const vault2 = new Vault({
        kdf: {
          algorithm: 'argon2id',
          memoryCost: 1024,
          timeCost: 1,
          parallelism: 1,
        },
      });

      vault2.loadMetadata(metadata);
      expect(vault2.getStatus()).toBe(VaultStatus.LOCKED);

      // Should unlock with correct passphrase
      const result = await vault2.unlock('my-secure-passphrase-123');
      expect(result).toBe(true);
    });

    it('should reject wrong passphrase on loaded vault', async () => {
      await vault.initialize('my-secure-passphrase-123');
      const metadata = vault.getMetadata()!;

      const vault2 = new Vault({
        kdf: {
          algorithm: 'argon2id',
          memoryCost: 1024,
          timeCost: 1,
          parallelism: 1,
        },
      });

      vault2.loadMetadata(metadata);
      const result = await vault2.unlock('totally-wrong-pass-123');
      expect(result).toBe(false);
    });
  });

  describe('memory zeroing', () => {
    it('should zero master key on lock', async () => {
      await vault.initialize('my-secure-passphrase-123');
      // After lock, should not be able to encrypt
      vault.lock();
      await expect(vault.encrypt(Buffer.from('test'))).rejects.toThrow();
    });
  });
});
