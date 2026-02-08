/**
 * Vault Unlock Component
 */

import React, { useState, useEffect, useRef } from 'react';
import './VaultUnlock.css';

interface VaultUnlockProps {
  onSuccess: () => void;
  onCancel?: () => void;
  allowSkip?: boolean;
}

export const VaultUnlock: React.FC<VaultUnlockProps> = ({
  onSuccess,
  onCancel,
  allowSkip = false,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || password.length === 0) {
      setError('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const result = await window.volary.vault.unlock(password);

      if (result.success) {
        setPassword('');
        onSuccess();
      } else {
        setAttemptCount(prev => prev + 1);
        setError(result.message || 'Invalid password');
        setPassword('');
        setTimeout(() => passwordInputRef.current?.focus(), 100);
      }
    } catch (err) {
      setAttemptCount(prev => prev + 1);
      setError(err instanceof Error ? err.message : 'Failed to unlock vault');
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && onCancel && !isSubmitting) {
      onCancel();
    }
  };

  const getErrorMessage = (): string => {
    if (!error) return '';
    if (attemptCount >= 3) {
      return `${error}. Too many failed attempts - please wait before trying again.`;
    }
    return error;
  };

  return (
    <div className="vault-unlock" onKeyDown={handleKeyDown}>
      <div className="vault-modal">
        <div className="vault-header">
          <div className="vault-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="vault-title">Unlock Volary</h2>
          <p className="vault-description">
            Enter your master password to access encrypted browsing history
          </p>
        </div>

        <form className="vault-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password" className="form-label">Master Password</label>
            <div className="password-input-wrapper">
              <input
                ref={passwordInputRef}
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isSubmitting}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>

            {attemptCount > 0 && (
              <p className="attempt-hint">Failed attempts: {attemptCount}</p>
            )}
          </div>

          {error && (
            <div className="form-error" role="alert">{getErrorMessage()}</div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !password || attemptCount >= 5}
            >
              {isSubmitting ? 'Unlocking...' : 'Unlock Vault'}
            </button>
            
            {allowSkip && onCancel && (
              <button type="button" className="btn btn-link" onClick={onCancel} disabled={isSubmitting}>
                Browse without vault
              </button>
            )}
          </div>
        </form>

        <div className="vault-footer">
          <p className="help-text">
            <strong>Forgot your password?</strong> Your master password cannot be recovered.
            You'll need to reset the vault (this will delete all encrypted data).
          </p>
        </div>
      </div>

      <div className="keyboard-hints">
        <kbd>Enter</kbd> to unlock
        {allowSkip && onCancel && (
          <>
            {' · '}
            <kbd>Esc</kbd> to skip
          </>
        )}
      </div>
    </div>
  );
};
