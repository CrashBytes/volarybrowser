/**
 * Header Privacy Module
 *
 * Centralizes outgoing request header modifications and incoming
 * response header manipulation for privacy:
 * - Referrer stripping (cross-origin)
 * - Third-party cookie blocking
 *
 * @module privacy/header-privacy
 */

import { session } from 'electron';
import { getSetting } from '../../../core/storage/repositories/settings';
import { LoggerFactory } from '../utils/logger';
import { config } from '../config';

const logger = LoggerFactory.create('HeaderPrivacy');

export class HeaderPrivacy {
  initialize(): void {
    this.installRequestFilter();
    this.installResponseFilter();
    logger.info('HeaderPrivacy initialized');
  }

  /**
   * Filter outgoing request headers:
   * - Strip cross-origin Referer header
   */
  private installRequestFilter(): void {
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };

      // Referrer stripping
      if (getSetting<boolean>('referrerStripping', true)) {
        const referer = headers['Referer'] || headers['referer'];
        if (referer) {
          try {
            const requestOrigin = new URL(details.url).origin;
            const refererOrigin = new URL(referer).origin;
            if (refererOrigin !== requestOrigin) {
              delete headers['Referer'];
              delete headers['referer'];
            }
          } catch { /* keep header if URL parsing fails */ }
        }
      }

      callback({ requestHeaders: headers });
    });
  }

  /**
   * Filter incoming response headers:
   * - Block third-party Set-Cookie headers
   * - Apply CSP to our own UI pages
   */
  private installResponseFilter(): void {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const isOurUI = details.url.startsWith('file://') ||
        details.url.startsWith('http://localhost');

      if (isOurUI) {
        // In development, skip CSP header injection — the HTML meta tag handles it
        // and the dev server needs permissive WebSocket/script policies
        if (!config.app.isDevelopment) {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              'Content-Security-Policy': [config.security.contentSecurityPolicy],
            },
          });
          return;
        }
        callback({ responseHeaders: details.responseHeaders });
        return;
      }

      // Block third-party cookies
      if (getSetting<boolean>('blockThirdPartyCookies', true)) {
        const responseHeaders = { ...details.responseHeaders };
        const setCookieKeys = Object.keys(responseHeaders).filter(
          k => k.toLowerCase() === 'set-cookie'
        );

        if (setCookieKeys.length > 0 && details.resourceType !== 'mainFrame') {
          try {
            const pageOrigin = details.referrer
              ? new URL(details.referrer).hostname
              : '';
            const requestHost = new URL(details.url).hostname;

            if (pageOrigin && !this.isSameSite(pageOrigin, requestHost)) {
              for (const key of setCookieKeys) {
                delete responseHeaders[key];
              }
            }
          } catch { /* keep cookies if URL parsing fails */ }
        }

        callback({ responseHeaders });
      } else {
        callback({ responseHeaders: details.responseHeaders });
      }
    });
  }

  /**
   * Check if two hostnames belong to the same site
   * (e.g., cdn.example.com and www.example.com are same-site)
   */
  private isSameSite(host1: string, host2: string): boolean {
    const getBase = (h: string) => {
      const parts = h.split('.');
      return parts.length >= 2 ? parts.slice(-2).join('.') : h;
    };
    return getBase(host1) === getBase(host2);
  }
}
