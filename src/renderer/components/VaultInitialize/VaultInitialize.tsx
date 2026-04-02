/**
 * Vault Initialization Component
 */

import React, { useState } from 'react';
import './VaultInitialize.css';

interface VaultInitializeProps {
  onSuccess: () => void;
  onCancel?: () => void;
  onSkip?: () => void;
}

enum PasswordStrength {
  WEAK = 'weak',
  FAIR = 'fair',
  GOOD = 'good',
  STRONG = 'strong',
}

export const VaultInitialize: React.FC<VaultInitializeProps> = ({
  onSuccess,
  onCancel,
  onSkip,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authLevel, setAuthLevel] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [strength, setStrength] = useState<PasswordStrength>(PasswordStrength.WEAK);

  const calculatePasswordStrength = (pwd: string): PasswordStrength => {
    if (pwd.length < 12) return PasswordStrength.WEAK;
    
    let score = 0;
    if (pwd.length >= 16) score += 2;
    else if (pwd.length >= 14) score += 1;
    
    if (/[a-z]/.test(pwd)) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^a-zA-Z0-9]/.test(pwd)) score += 1;
    
    if (/(.)\1{2,}/.test(pwd)) score -= 1;
    if (/^[a-zA-Z]+$/.test(pwd)) score -= 1;
    
    if (score >= 6) return PasswordStrength.STRONG;
    if (score >= 4) return PasswordStrength.GOOD;
    if (score >= 2) return PasswordStrength.FAIR;
    return PasswordStrength.WEAK;
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    setStrength(calculatePasswordStrength(newPassword));
    setError('');
  };

  const validateForm = (): string | null => {
    if (password.length < 12) return 'Password must be at least 12 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    if (strength === PasswordStrength.WEAK) return 'Password is too weak. Add more character variety.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const result = await window.volary.vault.initialize(password, authLevel);
      if (result.success) {
        setPassword('');
        setConfirmPassword('');
        onSuccess();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize vault');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStrengthClass = (): string => `strength-indicator ${strength}`;
  const getStrengthLabel = (): string => {
    switch (strength) {
      case PasswordStrength.WEAK: return 'Weak';
      case PasswordStrength.FAIR: return 'Fair';
      case PasswordStrength.GOOD: return 'Good';
      case PasswordStrength.STRONG: return 'Strong';
    }
  };

  return (
    <div className="vault-initialize">
      <div className="vault-modal">
        <div className="vault-header">
          <h2 className="vault-title">Create Your Vault</h2>
          <p className="vault-description">
            Your vault encrypts all browsing history and sensitive data.
            Choose a strong master password - you'll need it to unlock Volary.
          </p>
          {onSkip && (
            <button type="button" className="btn-skip" onClick={onSkip}>
              Skip for now — browse without encryption
            </button>
          )}
        </div>

        <form className="vault-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password" className="form-label">Master Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Enter master password (min 12 characters)"
                disabled={isSubmitting}
                autoFocus
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>

            {password.length > 0 && (
              <div className="password-strength">
                <div className={getStrengthClass()}>
                  <div className="strength-bar" />
                </div>
                <span className="strength-label">{getStrengthLabel()}</span>
              </div>
            )}

            <p className={`form-hint${password.length > 0 && password.length < 12 ? ' form-hint--warning' : ''}`}>
              {password.length > 0 && password.length < 12
                ? `${12 - password.length} more characters needed (minimum 12)`
                : 'Use a mix of uppercase, lowercase, numbers, and symbols'}
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password" className="form-label">Confirm Password</label>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter master password"
              disabled={isSubmitting}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Security Level</label>
            <div className="auth-level-options">
              <label className="auth-level-option">
                <input
                  type="radio"
                  name="authLevel"
                  value={1}
                  checked={authLevel === 1}
                  onChange={() => setAuthLevel(1)}
                  disabled={isSubmitting}
                />
                <div className="option-content">
                  <strong>Basic</strong>
                  <span className="option-description">PIN or biometric for browsing history</span>
                </div>
              </label>

              <label className="auth-level-option">
                <input
                  type="radio"
                  name="authLevel"
                  value={2}
                  checked={authLevel === 2}
                  onChange={() => setAuthLevel(2)}
                  disabled={isSubmitting}
                />
                <div className="option-content">
                  <strong>Vault</strong>
                  <span className="option-description">Full encryption for passwords and payment data</span>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="form-error" role="alert">{error}</div>
          )}

          <div className="form-actions">
            {onCancel && (
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || password.length < 12}>
              {isSubmitting ? 'Creating Vault...'
                : password.length < 12 ? `Create Vault (${12 - password.length} more chars)`
                : 'Create Vault'}
            </button>
          </div>
        </form>

        <div className="vault-footer">
          <p className="security-notice">
            <strong>⚠️ Important:</strong> Your master password cannot be recovered. Store it securely.
          </p>
        </div>
      </div>
    </div>
  );
};
