/**
 * Site Permissions Repository
 *
 * Stores per-site permission decisions (allow/deny) for
 * camera, microphone, geolocation, notifications, etc.
 *
 * @module core/storage/repositories/permissions
 */

import { getDatabase } from '../database';

export type PermissionDecision = 'allow' | 'deny';

export interface SitePermission {
  origin: string;
  permission: string;
  decision: PermissionDecision;
}

/**
 * Get a stored permission decision for a site
 */
export function getPermission(origin: string, permission: string): PermissionDecision | null {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT decision FROM site_permissions WHERE origin = ? AND permission = ?'
  ).get(origin, permission) as { decision: PermissionDecision } | undefined;
  return row?.decision ?? null;
}

/**
 * Save a permission decision for a site
 */
export function setPermission(origin: string, permission: string, decision: PermissionDecision): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO site_permissions (origin, permission, decision, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(origin, permission) DO UPDATE SET
      decision = excluded.decision,
      updated_at = unixepoch()
  `).run(origin, permission, decision);
}

/**
 * Get all permissions for a site
 */
export function getPermissionsForSite(origin: string): SitePermission[] {
  const db = getDatabase();
  const rows = db.prepare(
    'SELECT origin, permission, decision FROM site_permissions WHERE origin = ?'
  ).all(origin) as SitePermission[];
  return rows;
}

/**
 * Delete a specific permission
 */
export function deletePermission(origin: string, permission: string): void {
  const db = getDatabase();
  db.prepare(
    'DELETE FROM site_permissions WHERE origin = ? AND permission = ?'
  ).run(origin, permission);
}

/**
 * Delete all permissions for a site
 */
export function deletePermissionsForSite(origin: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM site_permissions WHERE origin = ?').run(origin);
}

/**
 * Get all stored permissions
 */
export function getAllPermissions(): SitePermission[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT origin, permission, decision FROM site_permissions ORDER BY origin, permission'
  ).all() as SitePermission[];
}
