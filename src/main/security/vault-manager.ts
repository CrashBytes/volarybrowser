/**
 * Vault Manager - Main Process Integration Layer
 * 
 * Architectural Role:
 * - Bridges core/security/vault.ts with main process IPC handlers
 * - Manages vault lifecycle (initialization, unlock, lock)
 * - Handles vault metadata persistence to disk
 * - Coordinates vault operations with application events
 * 
 * Design Philosophy:
 * - Single source of truth for vault state
 * - Event-driven architecture (emit status changes)
 * - Graceful degradation on errors
 * - Comprehensive audit logging
 * 
 * Security Considerations:
 * - Vault lock on system sleep/suspend
 * - Automatic lock after inactivity timeout
 * - Memory zeroing on process exit
 * - Audit trail for all vault operations
 * 
 * @module main/security/vault-manager
 */

import { app, powerMonitor } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { Vault, VaultStatus, AuthenticationLevel } from '../../../core/security/vault';
import { ILogger } from '../types';
import { LoggerFactory } from '../utils/logger';
import { config } from '../config';

/**
 * Vault metadata file structure
 * Stored in user data directory as JSON
 */
interface VaultMetadataFile {
  version: number;
  created: number;
  lastUnlocked: number;
  authLevel: AuthenticationLevel;
  kdfSalt: string;           // Base64-encoded salt
  verificationBlob: string;  // Base64-encoded HMAC verification blob
  kdfParams: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
}

/**
 * Vault operation result
 */
interface VaultResult {
  success: boolean;
  message: string;
}

/**
 * Vault status information
 */
interface VaultStatusInfo {
  isUnlocked: boolean;
  hasVault: boolean;
  authLevel: AuthenticationLevel | null;
}

/**
 * VaultManager class
 * 
 * Singleton responsible for all vault operations in main process
 * Coordinates with core Vault implementation and manages persistence
 */
export class VaultManager {
  private vault: Vault;
  private logger: ILogger;
  private vaultPath: string;
  private metadataPath: string;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Event emitter for vault status changes
   * Used to notify renderer process of vault state changes
   */
  private statusChangeListeners: Array<(status: VaultStatusInfo) => void> = [];

  constructor() {
    this.logger = LoggerFactory.create('VaultManager');
    this.vault = new Vault();

    // Determine vault storage location from config singleton
    this.vaultPath = path.join(config.app.vaultPath, 'vault.db');
    this.metadataPath = path.join(config.app.vaultPath, 'metadata.json');

    this.logger.info('VaultManager initialized', {
      vaultPath: this.vaultPath,
      metadataPath: this.metadataPath,
    });
  }

  /**
   * Initialize vault manager
   * 
   * Lifecycle:
   * 1. Ensure vault directory exists
   * 2. Load vault metadata if exists
   * 3. Register system event handlers
   * 4. Start inactivity timer
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing VaultManager');

    try {
      // Ensure vault directory exists
      await this.ensureVaultDirectory();

      // Load existing vault metadata
      await this.loadMetadata();

      // Register system event handlers
      this.registerSystemHandlers();

      // Start inactivity timer
      this.resetInactivityTimer();

      this.logger.info('VaultManager initialization complete', {
        hasVault: await this.hasVault(),
        status: this.vault.getStatus(),
      });
    } catch (error) {
      this.logger.error('VaultManager initialization failed', error as Error);
      throw error;
    }
  }

  /**
   * Initialize new vault with master password
   * 
   * @param password - Master password (min 12 chars)
   * @param authLevel - Authentication level (default: BASIC)
   * @returns Result of initialization
   */
  async initializeVault(
    password: string,
    authLevel: AuthenticationLevel = AuthenticationLevel.BASIC
  ): Promise<VaultResult> {
    try {
      this.logger.info('Initializing new vault', { authLevel });

      // Check if vault already exists
      if (await this.hasVault()) {
        return {
          success: false,
          message: 'Vault already exists',
        };
      }

      // Validate password
      if (!password || password.length < 12) {
        return {
          success: false,
          message: 'Password must be at least 12 characters',
        };
      }

      // Initialize vault
      await this.vault.initialize(password, authLevel);

      // Persist metadata
      await this.saveMetadata();

      this.logger.info('Vault initialized successfully');
      this.emitStatusChange();
      this.resetInactivityTimer();

      return {
        success: true,
        message: 'Vault initialized successfully',
      };
    } catch (error) {
      this.logger.error('Vault initialization failed', error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Unlock vault with password
   * 
   * @param password - Master password
   * @returns Result of unlock attempt
   */
  async unlock(password: string): Promise<VaultResult> {
    try {
      this.logger.info('Vault unlock attempt');

      // Check if vault exists
      if (!(await this.hasVault())) {
        return {
          success: false,
          message: 'No vault found. Please initialize vault first.',
        };
      }

      // Validate password
      if (!password || password.length === 0) {
        return {
          success: false,
          message: 'Password is required',
        };
      }

      // Attempt unlock
      const unlocked = await this.vault.unlock(password);

      if (unlocked) {
        this.logger.info('Vault unlocked successfully');
        this.emitStatusChange();
        this.resetInactivityTimer();
        
        return {
          success: true,
          message: 'Vault unlocked successfully',
        };
      } else {
        this.logger.warn('Vault unlock failed: Invalid password');
        return {
          success: false,
          message: 'Invalid password',
        };
      }
    } catch (error) {
      this.logger.error('Vault unlock error', error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Lock vault
   * 
   * Zeros all key material from memory
   * @returns Result of lock operation
   */
  lock(): VaultResult {
    try {
      this.logger.info('Locking vault');

      this.vault.lock();
      this.clearInactivityTimer();
      this.emitStatusChange();

      this.logger.info('Vault locked successfully');
      return {
        success: true,
        message: 'Vault locked successfully',
      };
    } catch (error) {
      this.logger.error('Vault lock error', error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current vault status
   * 
   * @returns Vault status information
   */
  getStatus(): VaultStatusInfo {
    const status = this.vault.getStatus();
    return {
      isUnlocked: status === VaultStatus.UNLOCKED,
      hasVault: status !== VaultStatus.UNINITIALIZED,
      authLevel: this.vault.getAuthLevel(),
    };
  }

  /**
   * Check if vault exists
   * 
   * @returns True if vault metadata file exists
   */
  private async hasVault(): Promise<boolean> {
    try {
      await fs.access(this.metadataPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure vault directory exists
   */
  private async ensureVaultDirectory(): Promise<void> {
    const vaultDir = path.dirname(this.vaultPath);
    try {
      await fs.mkdir(vaultDir, { recursive: true });
      
      // Set restrictive permissions (owner-only read/write)
      // Unix: 0700, Windows: equivalent
      if (process.platform !== 'win32') {
        await fs.chmod(vaultDir, 0o700);
      }
      
      this.logger.debug('Vault directory ready', { path: vaultDir });
    } catch (error) {
      this.logger.error('Failed to create vault directory', error as Error);
      throw error;
    }
  }

  /**
   * Load vault metadata from disk
   */
  private async loadMetadata(): Promise<void> {
    try {
      if (await this.hasVault()) {
        const data = await fs.readFile(this.metadataPath, 'utf-8');
        const metadata: VaultMetadataFile = JSON.parse(data);

        this.logger.debug('Vault metadata loaded', {
          version: metadata.version,
          authLevel: metadata.authLevel,
          created: new Date(metadata.created).toISOString(),
        });

        // Feed metadata into the Vault so it can verify keys on unlock
        this.vault.loadMetadata({
          version: metadata.version,
          created: metadata.created,
          lastUnlocked: metadata.lastUnlocked,
          authLevel: metadata.authLevel,
          kdfSalt: Buffer.from(metadata.kdfSalt, 'base64'),
          kdfParams: {
            algorithm: 'argon2id',
            ...metadata.kdfParams,
          },
          verificationBlob: Buffer.from(metadata.verificationBlob, 'base64'),
        });
      } else {
        this.logger.debug('No vault metadata found');
      }
    } catch (error) {
      this.logger.error('Failed to load vault metadata', error as Error);
      throw error;
    }
  }

  /**
   * Save vault metadata to disk
   */
  private async saveMetadata(): Promise<void> {
    try {
      const vaultMetadata = this.vault.getMetadata();
      if (!vaultMetadata) {
        throw new Error('No vault metadata available to save');
      }

      const metadata: VaultMetadataFile = {
        version: vaultMetadata.version,
        created: vaultMetadata.created,
        lastUnlocked: vaultMetadata.lastUnlocked,
        authLevel: vaultMetadata.authLevel,
        kdfSalt: vaultMetadata.kdfSalt.toString('base64'),
        verificationBlob: vaultMetadata.verificationBlob.toString('base64'),
        kdfParams: {
          memoryCost: vaultMetadata.kdfParams.memoryCost,
          timeCost: vaultMetadata.kdfParams.timeCost,
          parallelism: vaultMetadata.kdfParams.parallelism,
        },
      };

      const json = JSON.stringify(metadata, null, 2);
      await fs.writeFile(this.metadataPath, json, 'utf-8');

      // Set restrictive permissions
      if (process.platform !== 'win32') {
        await fs.chmod(this.metadataPath, 0o600);
      }

      this.logger.debug('Vault metadata saved');
    } catch (error) {
      this.logger.error('Failed to save vault metadata', error as Error);
      throw error;
    }
  }

  /**
   * Register system event handlers
   * 
   * Locks vault on:
   * - System sleep/suspend
   * - Screen lock
   * - Application quit
   */
  private registerSystemHandlers(): void {
    // Lock vault on system suspend
    powerMonitor.on('suspend', () => {
      this.logger.info('System suspending - locking vault');
      this.lock();
    });

    // Lock vault on screen lock (if available)
    if (powerMonitor.getSystemIdleState) {
      powerMonitor.on('lock-screen', () => {
        this.logger.info('Screen locked - locking vault');
        this.lock();
      });
    }

    // Lock vault before application quit
    app.on('before-quit', () => {
      this.logger.info('Application quitting - locking vault');
      this.lock();
    });

    this.logger.debug('System event handlers registered');
  }

  /**
   * Reset inactivity timer
   * 
   * Called on vault unlock and user activity
   */
  private resetInactivityTimer(): void {
    // Clear existing timer
    this.clearInactivityTimer();

    // Start new timer
    this.inactivityTimer = setTimeout(() => {
      if (this.vault.getStatus() === VaultStatus.UNLOCKED) {
        this.logger.info('Inactivity timeout - locking vault');
        this.lock();
      }
    }, this.INACTIVITY_TIMEOUT_MS);
  }

  /**
   * Clear inactivity timer
   */
  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  /**
   * Emit vault status change event
   */
  private emitStatusChange(): void {
    const status = this.getStatus();
    for (const listener of this.statusChangeListeners) {
      listener(status);
    }
  }

  /**
   * Subscribe to vault status changes
   * 
   * @param listener - Callback function
   */
  onStatusChange(listener: (status: VaultStatusInfo) => void): void {
    this.statusChangeListeners.push(listener);
  }

  /**
   * Get vault instance for direct operations
   * 
   * WARNING: Use with caution. Direct vault access bypasses
   * VaultManager lifecycle management and audit logging.
   * 
   * @returns Core vault instance
   */
  getVault(): Vault {
    return this.vault;
  }

  /**
   * Cleanup resources
   * 
   * Called on application shutdown
   */
  destroy(): void {
    this.logger.info('Destroying VaultManager');
    this.clearInactivityTimer();
    this.lock();
    this.statusChangeListeners = [];
  }
}
