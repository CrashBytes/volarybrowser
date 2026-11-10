import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';

/**
 * Regression: a vault that locked itself (idle, sleep, screen lock) left the
 * browser showing the last page with no password prompt. The status now says
 * when the session must be unlocked again, and the idle lock follows real
 * user idleness instead of a fixed 15 minutes after unlock.
 */

const { vaultDir, power } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('events');
  const os = await import('os');
  const path = await import('path');
  const power = Object.assign(new EventEmitter(), {
    idleSeconds: 0,
    getSystemIdleState: () => 'active',
    getSystemIdleTime: () => power.idleSeconds,
  });
  const vaultDir = path.join(os.tmpdir(), `volary-vm-${process.pid}-${Date.now()}`);
  return { vaultDir, power };
});

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => vaultDir },
  powerMonitor: power,
}));
vi.mock('../../../src/main/config', () => ({
  config: { app: { vaultPath: vaultDir, isDevelopment: false } },
}));
vi.mock('../../../src/main/utils/logger', () => {
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  return { LoggerFactory: { create: () => logger } };
});

import { VaultManager } from '../../../src/main/security/vault-manager';

const PASS = 'my-secure-passphrase-123';
const MINUTE = 60 * 1000;

describe('VaultManager session lock', () => {
  let vm: VaultManager;

  beforeEach(async () => {
    power.removeAllListeners();
    power.idleSeconds = 0;
    await fs.rm(vaultDir, { recursive: true, force: true });
    vm = new VaultManager();
    await vm.initialize();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vm.destroy();
    await fs.rm(vaultDir, { recursive: true, force: true });
  });

  it('does not require an unlock before the vault was ever unlocked', () => {
    expect(vm.getStatus().requiresUnlock).toBe(false);
  });

  it('requires an unlock once an unlocked vault locks, until it is unlocked again', async () => {
    await vm.initializeVault(PASS);
    expect(vm.getStatus().requiresUnlock).toBe(false);

    vm.lock();
    expect(vm.getStatus()).toMatchObject({ isUnlocked: false, requiresUnlock: true });

    await vm.unlock(PASS);
    expect(vm.getStatus()).toMatchObject({ isUnlocked: true, requiresUnlock: false });
  });

  it('reports requiresUnlock to listeners when the screen locks', async () => {
    await vm.initializeVault(PASS);
    const seen: Array<{ isUnlocked: boolean; requiresUnlock: boolean }> = [];
    vm.onStatusChange((s) => seen.push(s));

    power.emit('lock-screen');

    expect(seen.at(-1)).toMatchObject({ isUnlocked: false, requiresUnlock: true });
  });

  it('stays unlocked past 15 minutes while the user is active', async () => {
    await vm.initializeVault(PASS);
    vi.useFakeTimers();
    vm.restartIdleWatch();

    power.idleSeconds = 5;
    vi.advanceTimersByTime(40 * MINUTE);

    expect(vm.getStatus().isUnlocked).toBe(true);
  });

  it('locks once the user has been idle for 15 minutes', async () => {
    await vm.initializeVault(PASS);
    vi.useFakeTimers();
    vm.restartIdleWatch();

    power.idleSeconds = 15 * 60;
    vi.advanceTimersByTime(MINUTE);

    expect(vm.getStatus()).toMatchObject({ isUnlocked: false, requiresUnlock: true });
  });
});
