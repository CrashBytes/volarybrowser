/**
 * Download Manager
 *
 * Handles file downloads via Electron's will-download event.
 * Tracks progress and allows pause/resume/cancel.
 *
 * @module download-manager
 */

import { BrowserWindow, DownloadItem, session } from 'electron';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

export interface DownloadState {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  startTime: number;
}

export class DownloadManager {
  private logger: ILogger;
  private downloads: Map<string, { item: DownloadItem; state: DownloadState }> = new Map();
  private window: BrowserWindow | null = null;
  private nextId = 1;

  constructor() {
    this.logger = LoggerFactory.create('DownloadManager');
  }

  initialize(window: BrowserWindow): void {
    this.window = window;

    session.defaultSession.on('will-download', (_event, item) => {
      this.handleDownload(item);
    });

    this.logger.info('DownloadManager initialized');
  }

  private handleDownload(item: DownloadItem): void {
    const id = String(this.nextId++);
    const state: DownloadState = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath: item.getSavePath(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      startTime: Date.now(),
    };

    this.downloads.set(id, { item, state });
    this.broadcastUpdate();

    item.on('updated', (_event, updateState) => {
      state.receivedBytes = item.getReceivedBytes();
      state.totalBytes = item.getTotalBytes();
      state.savePath = item.getSavePath();
      state.state = updateState === 'interrupted' ? 'interrupted' : 'progressing';
      this.broadcastUpdate();
    });

    item.once('done', (_event, doneState) => {
      state.receivedBytes = item.getReceivedBytes();
      state.state = doneState === 'completed' ? 'completed' : 'cancelled';
      this.broadcastUpdate();
      this.logger.info('Download finished', { id, filename: state.filename, state: state.state });
    });

    this.logger.info('Download started', { id, filename: state.filename, url: state.url });
  }

  getAllDownloads(): DownloadState[] {
    return Array.from(this.downloads.values()).map(d => ({ ...d.state }));
  }

  pause(id: string): boolean {
    const dl = this.downloads.get(id);
    if (!dl || dl.state.state !== 'progressing') return false;
    dl.item.pause();
    return true;
  }

  resume(id: string): boolean {
    const dl = this.downloads.get(id);
    if (!dl) return false;
    if (dl.item.canResume()) {
      dl.item.resume();
      return true;
    }
    return false;
  }

  cancel(id: string): boolean {
    const dl = this.downloads.get(id);
    if (!dl || dl.state.state === 'completed' || dl.state.state === 'cancelled') return false;
    dl.item.cancel();
    return true;
  }

  private broadcastUpdate(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send('download:updated', this.getAllDownloads());
  }
}
