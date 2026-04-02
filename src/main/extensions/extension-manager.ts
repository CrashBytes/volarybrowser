/**
 * Extension Manager
 *
 * Orchestrates extension loading, manifest validation, permission granting,
 * and lifecycle management. Extensions are loaded from the userData/extensions/
 * directory on startup.
 *
 * @module extensions/extension-manager
 */

import { app } from 'electron';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import { LoadedExtension } from '../../../core/extensions/types';
import { parseManifest } from '../../../core/extensions/manifest-parser';
import { PermissionManager } from '../../../core/extensions/permission-manager';
import { ContentScriptInjector } from './content-script-injector';
import { ILogger } from '../types';
import { LoggerFactory } from '../utils/logger';

export class ExtensionManager {
  private logger: ILogger;
  private extensions: Map<string, LoadedExtension> = new Map();
  private permissionManager: PermissionManager;
  private contentScriptInjector: ContentScriptInjector;
  private extensionsDir: string;

  constructor() {
    this.logger = LoggerFactory.create('ExtensionManager');
    this.permissionManager = new PermissionManager();
    this.contentScriptInjector = new ContentScriptInjector();
    this.extensionsDir = path.join(app.getPath('userData'), 'extensions');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing ExtensionManager', { dir: this.extensionsDir });

    // Ensure extensions directory exists
    await fs.mkdir(this.extensionsDir, { recursive: true });

    // Load all installed extensions
    await this.loadInstalledExtensions();

    this.logger.info('ExtensionManager initialized', {
      extensionCount: this.extensions.size,
    });
  }

  private async loadInstalledExtensions(): Promise<void> {
    try {
      const entries = await fs.readdir(this.extensionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadExtension(path.join(this.extensionsDir, entry.name));
        }
      }
    } catch (error) {
      this.logger.error('Failed to scan extensions directory', error as Error);
    }
  }

  /**
   * Load a single extension from a directory
   */
  async loadExtension(extensionPath: string): Promise<LoadedExtension | null> {
    const manifestPath = path.join(extensionPath, 'manifest.json');

    try {
      const rawJson = await fs.readFile(manifestPath, 'utf-8');
      const raw = JSON.parse(rawJson);
      const result = parseManifest(raw);

      if (!result.success || !result.manifest) {
        this.logger.warn('Invalid extension manifest', {
          path: extensionPath,
          errors: result.errors,
        });
        return null;
      }

      if (result.warnings.length > 0) {
        this.logger.warn('Extension manifest warnings', {
          name: result.manifest.name,
          warnings: result.warnings,
        });
      }

      const id = this.generateExtensionId(extensionPath);
      const unsupported = this.permissionManager.grantPermissions(id, result.manifest);

      if (unsupported.length > 0) {
        this.logger.warn('Unsupported permissions ignored', {
          extension: result.manifest.name,
          unsupported,
        });
      }

      const loaded: LoadedExtension = {
        id,
        manifest: result.manifest,
        path: extensionPath,
        enabled: true,
        installedAt: Date.now(),
      };

      this.extensions.set(id, loaded);
      this.contentScriptInjector.registerExtension(loaded);

      this.logger.info('Extension loaded', { name: result.manifest.name, id });
      return loaded;
    } catch (error) {
      this.logger.error('Failed to load extension', error as Error, { path: extensionPath });
      return null;
    }
  }

  getExtension(id: string): LoadedExtension | undefined {
    return this.extensions.get(id);
  }

  getAllExtensions(): LoadedExtension[] {
    return Array.from(this.extensions.values());
  }

  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  getContentScriptInjector(): ContentScriptInjector {
    return this.contentScriptInjector;
  }

  /**
   * Enable or disable an extension
   */
  toggleExtension(id: string): boolean {
    const ext = this.extensions.get(id);
    if (!ext) return false;
    ext.enabled = !ext.enabled;
    if (ext.enabled) {
      this.contentScriptInjector.registerExtension(ext);
    } else {
      this.contentScriptInjector.unregisterExtension(id);
    }
    this.logger.info('Extension toggled', { id, enabled: ext.enabled });
    return ext.enabled;
  }

  /**
   * Remove an extension
   */
  async removeExtension(id: string): Promise<boolean> {
    const ext = this.extensions.get(id);
    if (!ext) return false;

    this.contentScriptInjector.unregisterExtension(id);
    this.permissionManager.revokePermissions(id);
    this.extensions.delete(id);

    // Delete extension directory
    try {
      const { promises: fs } = require('fs');
      await fs.rm(ext.path, { recursive: true, force: true });
    } catch (error) {
      this.logger.error('Failed to delete extension directory', error as Error);
    }

    this.logger.info('Extension removed', { id, name: ext.manifest.name });
    return true;
  }

  /**
   * Get serializable info about all extensions (for renderer)
   */
  getAllExtensionInfo(): Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    enabled: boolean;
  }> {
    return Array.from(this.extensions.values()).map(ext => ({
      id: ext.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      description: ext.manifest.description || '',
      enabled: ext.enabled,
    }));
  }

  private generateExtensionId(extensionPath: string): string {
    return createHash('sha256').update(extensionPath).digest('hex').slice(0, 32);
  }

  destroy(): void {
    this.logger.info('Destroying ExtensionManager');
    for (const [id] of this.extensions) {
      this.contentScriptInjector.unregisterExtension(id);
      this.permissionManager.revokePermissions(id);
    }
    this.extensions.clear();
  }
}
