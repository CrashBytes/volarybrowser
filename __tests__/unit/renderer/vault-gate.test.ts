import { describe, it, expect } from 'vitest';
import { vaultGate } from '../../../src/renderer/utils/vault-gate';

const base = { isLoading: false, hasVault: true, isUnlocked: false, skipped: false, requiresUnlock: false };

describe('vaultGate', () => {
  it('offers a skippable prompt at startup', () => {
    expect(vaultGate(base)).toEqual({ visible: true, dismissible: true });
  });

  it('stays out of the way once the startup prompt was skipped', () => {
    expect(vaultGate({ ...base, skipped: true }).visible).toBe(false);
  });

  it('is hidden while unlocked', () => {
    expect(vaultGate({ ...base, isUnlocked: true }).visible).toBe(false);
  });

  // Regression: skipping the prompt once silenced every later auto-lock, so a
  // locked browser came back showing the last page.
  it('shows a prompt that cannot be dismissed after an auto-lock, even if skipped earlier', () => {
    expect(vaultGate({ ...base, skipped: true, requiresUnlock: true }))
      .toEqual({ visible: true, dismissible: false });
  });
});
