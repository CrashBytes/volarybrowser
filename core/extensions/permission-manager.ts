/**
 * Extension Permission Manager
 *
 * Tracks and enforces permissions granted to extensions.
 * Only a subset of Chrome permissions are supported.
 *
 * @module core/extensions/permission-manager
 */

import { ChromePermission, ExtensionManifest } from './types';

const SUPPORTED_PERMISSIONS: Set<ChromePermission> = new Set([
  'storage',
  'tabs',
  'activeTab',
]);

export class PermissionManager {
  private grantedPermissions: Map<string, Set<ChromePermission>> = new Map();

  /**
   * Check if an extension has a specific permission
   */
  hasPermission(extensionId: string, permission: ChromePermission): boolean {
    const perms = this.grantedPermissions.get(extensionId);
    return perms?.has(permission) || false;
  }

  /**
   * Grant supported permissions from the manifest.
   * Returns list of unsupported permissions that were requested but not granted.
   */
  grantPermissions(extensionId: string, manifest: ExtensionManifest): string[] {
    const unsupported: string[] = [];
    const granted = new Set<ChromePermission>();

    for (const perm of manifest.permissions || []) {
      if (SUPPORTED_PERMISSIONS.has(perm)) {
        granted.add(perm);
      } else {
        unsupported.push(perm);
      }
    }

    this.grantedPermissions.set(extensionId, granted);
    return unsupported;
  }

  /**
   * Revoke all permissions for an extension
   */
  revokePermissions(extensionId: string): void {
    this.grantedPermissions.delete(extensionId);
  }

  /**
   * Get all granted permissions for an extension
   */
  getPermissions(extensionId: string): ChromePermission[] {
    const perms = this.grantedPermissions.get(extensionId);
    return perms ? Array.from(perms) : [];
  }
}
