import { describe, it, expect } from 'vitest';
import {
  windowFullscreenSchema,
  vaultInitializeSchema,
  vaultUnlockSchema,
  navNavigateToSchema,
  tabCloseSchema,
  tabSwitchSchema,
  tabUpdateBoundsSchema,
  zodValidator,
} from '../../../src/main/schemas/ipc-schemas';

describe('IPC Schemas', () => {
  describe('windowFullscreenSchema', () => {
    const validate = zodValidator(windowFullscreenSchema);

    it('should accept valid payload', () => {
      expect(validate({ fullscreen: true })).toBe(true);
      expect(validate({ fullscreen: false })).toBe(true);
    });

    it('should reject invalid payloads', () => {
      expect(validate(null)).toBe(false);
      expect(validate({})).toBe(false);
      expect(validate({ fullscreen: 'yes' })).toBe(false);
      expect(validate({ fullscreen: 1 })).toBe(false);
    });
  });

  describe('vaultInitializeSchema', () => {
    const validate = zodValidator(vaultInitializeSchema);

    it('should accept password only', () => {
      expect(validate({ password: 'my-password' })).toBe(true);
    });

    it('should accept password with authLevel', () => {
      expect(validate({ password: 'my-password', authLevel: 2 })).toBe(true);
    });

    it('should reject missing password', () => {
      expect(validate({})).toBe(false);
      expect(validate({ authLevel: 1 })).toBe(false);
    });

    it('should reject non-string password', () => {
      expect(validate({ password: 123 })).toBe(false);
    });

    it('should reject non-number authLevel', () => {
      expect(validate({ password: 'pass', authLevel: 'high' })).toBe(false);
    });
  });

  describe('vaultUnlockSchema', () => {
    const validate = zodValidator(vaultUnlockSchema);

    it('should accept valid payload', () => {
      expect(validate({ password: 'test' })).toBe(true);
    });

    it('should reject missing password', () => {
      expect(validate({})).toBe(false);
      expect(validate(null)).toBe(false);
    });
  });

  describe('navNavigateToSchema', () => {
    const validate = zodValidator(navNavigateToSchema);

    it('should accept valid URL', () => {
      expect(validate({ url: 'https://example.com' })).toBe(true);
    });

    it('should reject missing url', () => {
      expect(validate({})).toBe(false);
    });

    it('should reject non-string url', () => {
      expect(validate({ url: 123 })).toBe(false);
    });
  });

  describe('tabCloseSchema', () => {
    const validate = zodValidator(tabCloseSchema);

    it('should accept valid tabId', () => {
      expect(validate({ tabId: 'abc-123' })).toBe(true);
    });

    it('should reject missing tabId', () => {
      expect(validate({})).toBe(false);
    });
  });

  describe('tabSwitchSchema', () => {
    const validate = zodValidator(tabSwitchSchema);

    it('should accept valid tabId', () => {
      expect(validate({ tabId: 'xyz' })).toBe(true);
    });
  });

  describe('tabUpdateBoundsSchema', () => {
    const validate = zodValidator(tabUpdateBoundsSchema);

    it('should accept valid bounds', () => {
      expect(validate({ x: 0, y: 50, width: 1280, height: 720 })).toBe(true);
    });

    it('should reject missing fields', () => {
      expect(validate({ x: 0, y: 50 })).toBe(false);
      expect(validate({ x: 0, y: 50, width: 1280 })).toBe(false);
    });

    it('should reject non-number fields', () => {
      expect(validate({ x: '0', y: 50, width: 1280, height: 720 })).toBe(false);
    });
  });
});
