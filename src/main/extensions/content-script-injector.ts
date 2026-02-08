/**
 * Content Script Injector
 *
 * Injects extension content scripts (CSS and JS) into web pages
 * when the URL matches the extension's content_scripts patterns.
 *
 * @module extensions/content-script-injector
 */

import { WebContents } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { LoadedExtension, ContentScriptConfig } from '../../../core/extensions/types';
import { ILogger } from '../types';
import { LoggerFactory } from '../utils/logger';

export class ContentScriptInjector {
  private logger: ILogger;
  private extensions: Map<string, LoadedExtension> = new Map();

  constructor() {
    this.logger = LoggerFactory.create('ContentScriptInjector');
  }

  registerExtension(extension: LoadedExtension): void {
    this.extensions.set(extension.id, extension);
  }

  unregisterExtension(extensionId: string): void {
    this.extensions.delete(extensionId);
  }

  /**
   * Inject matching content scripts for a URL into webContents
   */
  async injectForUrl(webContents: WebContents, url: string): Promise<void> {
    for (const [, extension] of this.extensions) {
      if (!extension.enabled || !extension.manifest.content_scripts) continue;

      for (const config of extension.manifest.content_scripts) {
        if (this.matchesPattern(url, config.matches, config.exclude_matches)) {
          await this.injectContentScript(webContents, extension, config);
        }
      }
    }
  }

  private async injectContentScript(
    webContents: WebContents,
    extension: LoadedExtension,
    config: ContentScriptConfig,
  ): Promise<void> {
    // Inject CSS files
    for (const cssFile of config.css || []) {
      try {
        const cssPath = path.join(extension.path, cssFile);
        const css = await fs.readFile(cssPath, 'utf-8');
        await webContents.insertCSS(css);
        this.logger.debug('Injected CSS', { extension: extension.manifest.name, file: cssFile });
      } catch (error) {
        this.logger.error('Failed to inject CSS', error as Error, {
          extension: extension.manifest.name,
          file: cssFile,
        });
      }
    }

    // Inject JS files
    for (const jsFile of config.js || []) {
      try {
        const jsPath = path.join(extension.path, jsFile);
        const js = await fs.readFile(jsPath, 'utf-8');
        await webContents.executeJavaScript(js);
        this.logger.debug('Injected JS', { extension: extension.manifest.name, file: jsFile });
      } catch (error) {
        this.logger.error('Failed to inject JS', error as Error, {
          extension: extension.manifest.name,
          file: jsFile,
        });
      }
    }
  }

  /**
   * Check if URL matches any of the given patterns
   */
  private matchesPattern(url: string, matches: string[], excludeMatches?: string[]): boolean {
    const isMatch = matches.some((pattern) => this.urlMatchesPattern(url, pattern));
    if (!isMatch) return false;

    if (excludeMatches) {
      const isExcluded = excludeMatches.some((pattern) => this.urlMatchesPattern(url, pattern));
      if (isExcluded) return false;
    }

    return true;
  }

  /**
   * Match a URL against a Chrome extension match pattern
   *
   * Patterns: <all_urls>, *://*.example.com/*, https://example.com/*
   */
  private urlMatchesPattern(url: string, pattern: string): boolean {
    if (pattern === '<all_urls>') return true;

    try {
      // Convert Chrome match pattern to regex
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*');
      const regex = new RegExp(`^${escaped}$`);
      return regex.test(url);
    } catch {
      return false;
    }
  }
}
