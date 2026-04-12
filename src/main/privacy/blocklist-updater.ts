/**
 * Blocklist Updater
 *
 * Downloads and parses community filter lists to expand ad/tracker blocking.
 * Supports hosts-file format and plain domain lists.
 * Caches lists locally for offline use.
 *
 * @module privacy/blocklist-updater
 */

import { app, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerFactory } from '../utils/logger';

const logger = LoggerFactory.create('BlocklistUpdater');

/** Built-in list sources with URLs and descriptions */
const DEFAULT_LISTS: { id: string; name: string; url: string }[] = [
  {
    id: 'stevenblack',
    name: 'Steven Black Unified Hosts',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
  },
  {
    id: 'peterlowe',
    name: "Peter Lowe's Ad/Tracking List",
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext',
  },
  {
    id: 'easyprivacy-domains',
    name: 'EasyPrivacy Tracking Domains',
    url: 'https://v.firebog.net/hosts/Easyprivacy.txt',
  },
  {
    id: 'adguard-tracking',
    name: 'AdGuard Tracking Protection',
    url: 'https://v.firebog.net/hosts/AdguardDNS.txt',
  },
];

export class BlocklistUpdater {
  private cacheDir: string = '';
  private loadedDomains: string[] = [];

  initialize(): void {
    this.cacheDir = path.join(app.getPath('userData'), 'blocklists');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    logger.info('BlocklistUpdater initialized', { cacheDir: this.cacheDir });
  }

  /**
   * Load all enabled lists — from cache first, then update in background
   */
  async loadAll(): Promise<string[]> {
    this.loadedDomains = [];

    for (const list of DEFAULT_LISTS) {
      const cached = this.readCache(list.id);
      if (cached) {
        const domains = this.parseHostsFile(cached);
        for (const d of domains) this.loadedDomains.push(d);
        logger.info('Loaded cached blocklist', { id: list.id, domains: domains.length });
      }
    }

    // Update in background
    this.updateAll().catch(err => {
      logger.error('Background blocklist update failed', err as Error);
    });

    return this.loadedDomains;
  }

  /**
   * Force update all lists from their URLs
   */
  async updateAll(): Promise<string[]> {
    const allDomains: string[] = [];

    for (const list of DEFAULT_LISTS) {
      try {
        const content = await this.download(list.url);
        if (content) {
          this.writeCache(list.id, content);
          const domains = this.parseHostsFile(content);
          for (const d of domains) allDomains.push(d);
          logger.info('Updated blocklist', { id: list.id, domains: domains.length });
        }
      } catch (error) {
        logger.error('Failed to update blocklist', error as Error, { id: list.id });
      }
    }

    this.loadedDomains = allDomains;
    return allDomains;
  }

  /**
   * Get all currently loaded domains
   */
  getLoadedDomains(): string[] {
    return this.loadedDomains;
  }

  /**
   * Get available lists
   */
  getLists(): { id: string; name: string; url: string }[] {
    return DEFAULT_LISTS;
  }

  /**
   * Parse a hosts-file or plain domain list
   * Supports formats:
   *   0.0.0.0 domain.com
   *   127.0.0.1 domain.com
   *   domain.com
   */
  private parseHostsFile(content: string): string[] {
    const domains: string[] = [];
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Skip comments and empty lines
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;

      // Hosts format: "0.0.0.0 domain" or "127.0.0.1 domain"
      const hostsMatch = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(.+)/);
      if (hostsMatch) {
        const domain = hostsMatch[1].split('#')[0].trim().toLowerCase();
        if (domain && domain !== 'localhost' && domain !== 'localhost.localdomain' && !domain.startsWith('::')) {
          domains.push(domain);
        }
        continue;
      }

      // Plain domain format (one per line, no IP prefix)
      if (/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/i.test(line)) {
        domains.push(line.toLowerCase());
      }
    }

    return domains;
  }

  private download(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = net.request({ url, redirect: 'follow' });
      let body = '';
      const timeout = setTimeout(() => {
        request.abort();
        reject(new Error('Download timeout'));
      }, 30000);

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          body += chunk.toString();
        });
        response.on('end', () => {
          clearTimeout(timeout);
          if (response.statusCode === 200) {
            resolve(body);
          } else {
            reject(new Error(`HTTP ${response.statusCode}`));
          }
        });
        response.on('error', (err) => { clearTimeout(timeout); reject(err); });
      });

      request.on('error', (err) => { clearTimeout(timeout); reject(err); });
      request.end();
    });
  }

  private readCache(listId: string): string | null {
    try {
      const filePath = path.join(this.cacheDir, `${listId}.txt`);
      if (fs.existsSync(filePath)) {
        // Use cache if less than 24 hours old
        const stat = fs.statSync(filePath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < 24 * 60 * 60 * 1000) {
          return fs.readFileSync(filePath, 'utf-8');
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  private writeCache(listId: string, content: string): void {
    try {
      const filePath = path.join(this.cacheDir, `${listId}.txt`);
      fs.writeFileSync(filePath, content);
    } catch (error) {
      logger.error('Failed to write blocklist cache', error as Error, { listId });
    }
  }
}
