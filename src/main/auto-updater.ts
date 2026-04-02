/**
 * Auto Updater
 *
 * Checks for updates on startup and periodically using electron-updater.
 * Shows a notification in the status bar when an update is available.
 *
 * @module auto-updater
 */

import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

const CHECK_INTERVAL_MS = 4 * 60 * 60_000; // 4 hours

export class AutoUpdater {
  private logger: ILogger;
  private window: BrowserWindow | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.logger = LoggerFactory.create('AutoUpdater');
  }

  initialize(window: BrowserWindow): void {
    this.window = window;

    // Don't auto-download — let the user decide
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      this.logger.info('Update available', { version: info.version });
      this.notify('update-available', { version: info.version });
    });

    autoUpdater.on('update-not-available', () => {
      this.logger.debug('No update available');
    });

    autoUpdater.on('download-progress', (progress) => {
      this.notify('update-progress', {
        percent: Math.round(progress.percent),
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.logger.info('Update downloaded', { version: info.version });
      this.notify('update-ready', { version: info.version });
    });

    autoUpdater.on('error', (error) => {
      this.logger.error('Auto-update error', error);
    });

    // Check on startup (delayed to not block startup)
    setTimeout(() => this.checkForUpdates(), 10_000);

    // Periodic checks
    this.checkInterval = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL_MS);

    this.logger.info('AutoUpdater initialized');
  }

  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      // Silently fail — updates are non-critical
      this.logger.debug('Update check failed', { error: (error as Error).message });
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  installUpdate(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  private notify(event: string, data: Record<string, unknown>): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('updater:status', { event, ...data });
    }
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
