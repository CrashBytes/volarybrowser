/**
 * Decides whether the vault prompt covers the browser, and whether the user
 * may dismiss it.
 *
 * At startup the prompt is optional ("Browse without vault"). Once the vault
 * has been unlocked and then locks (idle, sleep, screen lock, manual), the
 * prompt comes back regardless of an earlier skip and cannot be dismissed.
 */
export interface VaultGateInput {
  isLoading: boolean;
  hasVault: boolean;
  isUnlocked: boolean;
  skipped?: boolean;
  requiresUnlock?: boolean;
}

export interface VaultGate {
  visible: boolean;
  dismissible: boolean;
}

export function vaultGate(status: VaultGateInput): VaultGate {
  if (status.requiresUnlock && !status.isUnlocked) {
    return { visible: true, dismissible: false };
  }
  const visible = !status.skipped &&
    (status.isLoading || !status.hasVault || !status.isUnlocked);
  return { visible, dismissible: true };
}
