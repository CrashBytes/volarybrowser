/**
 * Force Dark Mode
 *
 * Injects CSS into web pages to force a dark color scheme,
 * even on sites that don't natively support dark mode.
 *
 * @module privacy/force-dark-mode
 */

import { session } from 'electron';
import { getSetting, setSetting } from '../../../core/storage/repositories/settings';
import { ILogger } from '../types';
import { LoggerFactory } from '../utils/logger';

const DARK_MODE_CSS = `
  html {
    filter: invert(0.9) hue-rotate(180deg) !important;
    background: #111 !important;
  }
  img, video, canvas, svg image, [style*="background-image"],
  picture, figure img {
    filter: invert(1) hue-rotate(-180deg) !important;
  }
  iframe {
    filter: invert(1) hue-rotate(-180deg) !important;
  }
`;

const INJECTION_KEY = 'volary-force-dark-mode';

export class ForceDarkMode {
  private logger: ILogger;
  private enabled: boolean;

  constructor() {
    this.logger = LoggerFactory.create('ForceDarkMode');
    this.enabled = false;
  }

  initialize(): void {
    // Load saved preference
    try {
      this.enabled = getSetting('forceDarkMode', false);
    } catch {
      this.enabled = false;
    }

    if (this.enabled) {
      this.installCSS();
    }

    this.logger.info('ForceDarkMode initialized', { enabled: this.enabled });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;

    try {
      setSetting('forceDarkMode', this.enabled);
    } catch {
      // Settings DB might not be ready
    }

    if (this.enabled) {
      this.installCSS();
    } else {
      this.removeCSS();
    }

    this.logger.info('Force dark mode toggled', { enabled: this.enabled });
    return this.enabled;
  }

  private installCSS(): void {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: [] }, // This listener is already registered by NetworkFilter
      (_details, callback) => callback({})
    );

    // Use insertCSS on new page loads via webContents
    // This is handled per-tab in TabManager
  }

  private removeCSS(): void {
    // Removal handled per-tab
  }

  /**
   * Get the dark mode CSS to inject into tabs
   */
  getCSS(): string {
    return DARK_MODE_CSS;
  }

  /**
   * Get the injection key for tracking
   */
  getKey(): string {
    return INJECTION_KEY;
  }
}
