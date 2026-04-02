/**
 * Network Filter - Ad/Tracker Blocking
 *
 * Blocks requests to known ad and tracker domains using
 * Electron's session.webRequest.onBeforeRequest API.
 *
 * Uses a domain-based blocklist approach for performance.
 * Filter lists are loaded on startup and can be updated.
 *
 * @module privacy/network-filter
 */

import { session } from 'electron';
import { ILogger } from '../types';
import { LoggerFactory } from '../utils/logger';

/**
 * Well-known ad/tracker domains (curated subset for built-in blocking).
 * This provides baseline protection without requiring external list downloads.
 */
const BUILT_IN_BLOCKLIST: string[] = [
  // Google Ads
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'googleadservices.com',
  'googlesyndication.com',
  'doubleclick.net',
  'googletagmanager.com',
  'google-analytics.com',
  'googletagservices.com',
  'tpc.googlesyndication.com',

  // Facebook tracking
  'pixel.facebook.com',
  'connect.facebook.net',
  'graph.facebook.com',

  // Common ad networks
  'ads.yahoo.com',
  'advertising.com',
  'adnxs.com',
  'adsrvr.org',
  'adform.net',
  'ads-twitter.com',
  'amazon-adsystem.com',
  'criteo.com',
  'criteo.net',
  'casalemedia.com',
  'moatads.com',
  'outbrain.com',
  'taboola.com',
  'zedo.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'smartadserver.com',
  'bidswitch.net',

  // Trackers
  'hotjar.com',
  'hotjar.io',
  'mixpanel.com',
  'segment.com',
  'segment.io',
  'amplitude.com',
  'fullstory.com',
  'mouseflow.com',
  'crazyegg.com',
  'optimizely.com',
  'quantserve.com',
  'scorecardresearch.com',
  'chartbeat.com',
  'chartbeat.net',
  'newrelic.com',
  'nr-data.net',
  'analytics.tiktok.com',
  'snap.licdn.com',

  // Malware/tracking domains
  'tracking.epicgames.com',
  'telemetry.microsoft.com',
  'vortex.data.microsoft.com',
];

export class NetworkFilter {
  private logger: ILogger;
  private blockedDomains: Set<string> = new Set();
  private blockedCount = 0;
  private blockedUrls: string[] = [];
  private enabled = true;
  private statusCallback: ((count: number, urls: string[]) => void) | null = null;

  constructor() {
    this.logger = LoggerFactory.create('NetworkFilter');
  }

  /**
   * Initialize the network filter
   */
  initialize(): void {
    // Load built-in blocklist
    for (const domain of BUILT_IN_BLOCKLIST) {
      this.blockedDomains.add(domain);
    }

    this.logger.info('NetworkFilter initialized', {
      domainCount: this.blockedDomains.size,
    });

    // Install the request interceptor
    this.installFilter();
  }

  /**
   * Register a callback for blocked count updates
   */
  onBlockedCountUpdate(callback: (count: number, urls: string[]) => void): void {
    this.statusCallback = callback;
  }

  /**
   * Get the current blocked request count
   */
  getBlockedCount(): number {
    return this.blockedCount;
  }

  /**
   * Enable or disable filtering
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.info(`NetworkFilter ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if filtering is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Add domains to the blocklist
   */
  addDomains(domains: string[]): void {
    for (const domain of domains) {
      const trimmed = domain.trim().toLowerCase();
      if (trimmed && !trimmed.startsWith('#')) {
        this.blockedDomains.add(trimmed);
      }
    }
  }

  /**
   * Reset the blocked count (e.g. on new page navigation)
   */
  resetCount(): void {
    this.blockedCount = 0;
    this.blockedUrls = [];
  }

  getBlockedUrls(): string[] {
    return [...this.blockedUrls];
  }

  private installFilter(): void {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      if (!this.enabled) {
        callback({});
        return;
      }

      // Don't filter our own UI
      if (details.url.startsWith('file://') || details.url.startsWith('http://localhost')) {
        callback({});
        return;
      }

      try {
        const url = new URL(details.url);
        if (this.shouldBlock(url.hostname)) {
          this.blockedCount++;
          this.blockedUrls.push(url.hostname);
          this.logger.debug('Blocked request', { hostname: url.hostname, total: this.blockedCount });
          if (this.statusCallback) {
            this.statusCallback(this.blockedCount, this.blockedUrls);
          }
          callback({ cancel: true });
          return;
        }
      } catch {
        // Malformed URL — allow it through
      }

      callback({});
    });
  }

  /**
   * Check if a hostname should be blocked.
   * Matches exact domain and parent domains (e.g. ads.example.com
   * is blocked if example.com is in the list).
   */
  private shouldBlock(hostname: string): boolean {
    const lower = hostname.toLowerCase();

    // Check exact match
    if (this.blockedDomains.has(lower)) return true;

    // Check parent domains (e.g. sub.doubleclick.net → doubleclick.net)
    const parts = lower.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (this.blockedDomains.has(parent)) return true;
    }

    return false;
  }
}
