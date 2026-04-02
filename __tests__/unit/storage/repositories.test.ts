import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../../core/storage/database';
import { saveWindowState, loadWindowState } from '../../../core/storage/repositories/window-state';
import { getSetting, setSetting, deleteSetting, getAllSettings } from '../../../core/storage/repositories/settings';

describe('WindowState Repository', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'volary-test-'));
    initDatabase(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return null when no state saved', () => {
    expect(loadWindowState()).toBeNull();
  });

  it('should save and load window state', () => {
    saveWindowState({ x: 100, y: 200, width: 1280, height: 800, isMaximized: false });
    const state = loadWindowState();
    expect(state).toEqual({
      x: 100,
      y: 200,
      width: 1280,
      height: 800,
      isMaximized: false,
    });
  });

  it('should update existing state (upsert)', () => {
    saveWindowState({ x: 100, y: 200, width: 1280, height: 800, isMaximized: false });
    saveWindowState({ x: 300, y: 400, width: 1920, height: 1080, isMaximized: true });

    const state = loadWindowState();
    expect(state).toEqual({
      x: 300,
      y: 400,
      width: 1920,
      height: 1080,
      isMaximized: true,
    });
  });
});

describe('Settings Repository', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'volary-test-'));
    initDatabase(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return default for missing key', () => {
    expect(getSetting('missing', 'default')).toBe('default');
  });

  it('should save and retrieve string setting', () => {
    setSetting('theme', 'dark');
    expect(getSetting('theme', 'light')).toBe('dark');
  });

  it('should save and retrieve number setting', () => {
    setSetting('fontSize', 14);
    expect(getSetting('fontSize', 12)).toBe(14);
  });

  it('should save and retrieve boolean setting', () => {
    setSetting('autoUpdate', true);
    expect(getSetting('autoUpdate', false)).toBe(true);
  });

  it('should save and retrieve object setting', () => {
    setSetting('proxy', { host: 'localhost', port: 8080 });
    expect(getSetting('proxy', null)).toEqual({ host: 'localhost', port: 8080 });
  });

  it('should update existing setting', () => {
    setSetting('theme', 'dark');
    setSetting('theme', 'light');
    expect(getSetting('theme', 'dark')).toBe('light');
  });

  it('should delete a setting', () => {
    setSetting('toDelete', 'value');
    deleteSetting('toDelete');
    expect(getSetting('toDelete', 'default')).toBe('default');
  });

  it('should get all settings', () => {
    setSetting('a', 1);
    setSetting('b', 'two');
    setSetting('c', true);

    const all = getAllSettings();
    expect(all).toEqual({ a: 1, b: 'two', c: true });
  });
});
