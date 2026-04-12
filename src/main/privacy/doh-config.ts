/**
 * DNS over HTTPS (DoH) Configuration
 *
 * Configures Chromium's built-in DoH support to encrypt DNS queries.
 * Must be called before app.ready since it uses command-line switches.
 *
 * @module privacy/doh-config
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerFactory } from '../utils/logger';

const logger = LoggerFactory.create('DoHConfig');

export interface DoHSettings {
  enabled: boolean;
  provider: 'cloudflare' | 'google' | 'quad9' | 'custom';
  customUrl?: string;
}

const DOH_PROVIDERS: Record<string, string> = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
};

/**
 * Read DoH settings from a JSON file in userData.
 * Uses a separate file (not SQLite) because this must run before app.ready
 * and before the database is initialized.
 */
function readDoHSettings(): DoHSettings {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'doh-settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return {
        enabled: data.enabled === true,
        provider: data.provider || 'cloudflare',
        customUrl: data.customUrl,
      };
    }
  } catch {
    // Ignore read errors, use defaults
  }
  return { enabled: true, provider: 'cloudflare' };
}

/**
 * Save DoH settings to the JSON config file.
 * Called from settings UI via IPC.
 */
export function saveDoHSettings(settings: DoHSettings): void {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'doh-settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    logger.info('DoH settings saved (restart required)', settings);
  } catch (error) {
    logger.error('Failed to save DoH settings', error as Error);
  }
}

/**
 * Read current DoH settings (for UI display)
 */
export function getDoHSettings(): DoHSettings {
  return readDoHSettings();
}

/**
 * Apply DoH command-line switches.
 * MUST be called before app.ready.
 */
export function applyDoHConfig(): void {
  const settings = readDoHSettings();

  if (!settings.enabled) {
    logger.info('DoH disabled by user setting');
    return;
  }

  let template: string;
  if (settings.provider === 'custom' && settings.customUrl) {
    template = settings.customUrl;
  } else {
    template = DOH_PROVIDERS[settings.provider] || DOH_PROVIDERS.cloudflare;
  }

  app.commandLine.appendSwitch('enable-features', 'DnsOverHttps');
  app.commandLine.appendSwitch('dns-over-https-mode', 'secure');
  app.commandLine.appendSwitch('dns-over-https-templates', template);

  logger.info('DoH configured', { provider: settings.provider, template });
}
