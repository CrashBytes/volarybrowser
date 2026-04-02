import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../../core/storage/database';
import {
  getPermission, setPermission, getPermissionsForSite,
  deletePermission, deletePermissionsForSite, getAllPermissions,
} from '../../../core/storage/repositories/permissions';

describe('Permissions Repository', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'volary-test-'));
    initDatabase(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return null for unknown permission', () => {
    expect(getPermission('https://example.com', 'camera')).toBeNull();
  });

  it('should save and retrieve a permission', () => {
    setPermission('https://example.com', 'camera', 'allow');
    expect(getPermission('https://example.com', 'camera')).toBe('allow');
  });

  it('should update an existing permission', () => {
    setPermission('https://example.com', 'camera', 'allow');
    setPermission('https://example.com', 'camera', 'deny');
    expect(getPermission('https://example.com', 'camera')).toBe('deny');
  });

  it('should get all permissions for a site', () => {
    setPermission('https://example.com', 'camera', 'allow');
    setPermission('https://example.com', 'microphone', 'deny');
    setPermission('https://other.com', 'camera', 'allow');

    const perms = getPermissionsForSite('https://example.com');
    expect(perms).toHaveLength(2);
  });

  it('should delete a specific permission', () => {
    setPermission('https://example.com', 'camera', 'allow');
    deletePermission('https://example.com', 'camera');
    expect(getPermission('https://example.com', 'camera')).toBeNull();
  });

  it('should delete all permissions for a site', () => {
    setPermission('https://example.com', 'camera', 'allow');
    setPermission('https://example.com', 'microphone', 'deny');
    deletePermissionsForSite('https://example.com');
    expect(getPermissionsForSite('https://example.com')).toHaveLength(0);
  });

  it('should get all stored permissions', () => {
    setPermission('https://a.com', 'camera', 'allow');
    setPermission('https://b.com', 'location', 'deny');
    const all = getAllPermissions();
    expect(all).toHaveLength(2);
  });
});
