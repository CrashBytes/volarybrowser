/**
 * Tab Manager - Multi-tab browsing via BrowserView
 *
 * Each tab is a separate BrowserView overlaid on the main BrowserWindow.
 * The renderer process displays browser chrome (tab bar, address bar, status bar)
 * and the active tab's BrowserView is positioned to fill the remaining space.
 *
 * Security:
 * - Tab BrowserViews have no preload script (no access to volary API)
 * - contextIsolation: true, nodeIntegration: false, sandbox: true
 * - New window requests (target="_blank") open as new tabs, not new windows
 *
 * @module tab-manager
 */

import { BrowserView, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { TabState, TabCreateOptions, TabResult, TabUpdateEvent, ILogger } from './types';
import { LoggerFactory } from './utils/logger';
import { validateAndNormalizeUrl } from './utils/url-validator';
import { attachContextMenu } from './context-menu';
import type { ContentScriptInjector } from './extensions/content-script-injector';
import type { ForceDarkMode } from './privacy/force-dark-mode';
import type { ColorblindMode } from './privacy/colorblind-mode';

interface ManagedTab {
  view: BrowserView;
  state: TabState;
}

export class TabManager {
  private logger: ILogger;
  private tabs: Map<string, ManagedTab> = new Map();
  private activeTabId: string | null = null;
  private window: BrowserWindow | null = null;
  private viewBounds: Electron.Rectangle = { x: 0, y: 88, width: 1280, height: 680 };
  private contentScriptInjector: ContentScriptInjector | null = null;
  private forceDarkMode: ForceDarkMode | null = null;
  private colorblindMode: ColorblindMode | null = null;
  private onNavigateCallback: ((url: string, title: string) => void) | null = null;

  constructor() {
    this.logger = LoggerFactory.create('TabManager');
  }

  /**
   * Register a callback for navigation events (used by HistoryManager)
   */
  onNavigate(callback: (url: string, title: string) => void): void {
    this.onNavigateCallback = callback;
  }

  setForceDarkMode(darkMode: ForceDarkMode): void {
    this.forceDarkMode = darkMode;
  }

  setColorblindMode(cbMode: ColorblindMode): void {
    this.colorblindMode = cbMode;
  }

  /**
   * Attach to main BrowserWindow
   */
  setWindow(window: BrowserWindow): void {
    this.window = window;

    window.on('resize', () => {
      this.repositionActiveView();
    });

    this.logger.info('TabManager attached to window');
  }

  /**
   * Set the content script injector for extension support
   */
  setContentScriptInjector(injector: ContentScriptInjector): void {
    this.contentScriptInjector = injector;
  }

  /**
   * Create a new tab
   */
  async createTab(options: TabCreateOptions = {}): Promise<TabResult<{ tabId: string }>> {
    if (!this.window || this.window.isDestroyed()) {
      return { success: false, message: 'No window available' };
    }

    const tabId = randomUUID();
    const url = options.url ? validateAndNormalizeUrl(options.url).url : '';

    const view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // No preload - tab content must not access volary API
      },
    });

    const state: TabState = {
      id: tabId,
      url,
      title: 'New Tab',
      favicon: '',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isActive: false,
      isAudioPlaying: false,
      isMuted: false,
      isPinned: false,
      createdAt: Date.now(),
    };

    this.tabs.set(tabId, { view, state });
    this.attachWebContentsListeners(tabId, view);
    attachContextMenu(view, this);

    // Activate this tab if requested (default: yes)
    if (options.active !== false) {
      this.switchTab(tabId);
    }

    // Load URL if provided
    if (url) {
      state.isLoading = true;
      try {
        await view.webContents.loadURL(url);
      } catch (error) {
        this.logger.error('Failed to load URL in new tab', error as Error, { url, tabId });
      }
    }

    this.broadcastTabUpdate();
    this.logger.info('Tab created', { tabId, url });
    return { success: true, message: 'Tab created', data: { tabId } };
  }

  /**
   * Close a tab
   */
  async closeTab(tabId: string): Promise<TabResult> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return { success: false, message: 'Tab not found' };
    }

    const wasActive = tabId === this.activeTabId;

    // Remove view from window
    if (this.window && !this.window.isDestroyed()) {
      this.window.removeBrowserView(tab.view);
    }

    // Destroy the webContents
    (tab.view.webContents as any).destroy?.();
    this.tabs.delete(tabId);

    this.logger.info('Tab closed', { tabId });

    // If we closed the active tab, switch to another
    if (wasActive) {
      this.activeTabId = null;
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1]);
      } else {
        // Last tab closed - create a new blank tab
        await this.createTab({ active: true });
        return { success: true, message: 'Tab closed' };
      }
    }

    this.broadcastTabUpdate();
    return { success: true, message: 'Tab closed' };
  }

  /**
   * Switch to a tab
   */
  switchTab(tabId: string): TabResult {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return { success: false, message: 'Tab not found' };
    }

    if (!this.window || this.window.isDestroyed()) {
      return { success: false, message: 'No window available' };
    }

    // Deactivate current tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const prevTab = this.tabs.get(this.activeTabId);
      if (prevTab) {
        prevTab.state.isActive = false;
        this.window.removeBrowserView(prevTab.view);
      }
    }

    // Activate new tab
    this.activeTabId = tabId;
    tab.state.isActive = true;
    this.window.addBrowserView(tab.view);
    tab.view.setBounds(this.viewBounds);

    this.broadcastTabUpdate();
    this.logger.debug('Switched to tab', { tabId });
    return { success: true, message: 'Switched to tab' };
  }

  /**
   * Update the bounds for tab content area
   */
  updateBounds(bounds: Electron.Rectangle): void {
    this.viewBounds = bounds;
    this.repositionActiveView();
  }

  // -- Navigation delegation --

  goBack(): void {
    const tab = this.getActiveTab();
    if (tab && tab.view.webContents.canGoBack()) {
      tab.view.webContents.goBack();
    }
  }

  goForward(): void {
    const tab = this.getActiveTab();
    if (tab && tab.view.webContents.canGoForward()) {
      tab.view.webContents.goForward();
    }
  }

  reload(): void {
    const tab = this.getActiveTab();
    if (tab) {
      tab.view.webContents.reload();
    }
  }

  stop(): void {
    const tab = this.getActiveTab();
    if (tab) {
      tab.view.webContents.stop();
    }
  }

  async navigate(rawInput: string): Promise<TabResult> {
    const tab = this.getActiveTab();
    if (!tab) {
      return { success: false, message: 'No active tab' };
    }

    const { url } = validateAndNormalizeUrl(rawInput);

    try {
      await tab.view.webContents.loadURL(url);
      return { success: true, message: 'Navigation successful' };
    } catch (error) {
      this.logger.error('Navigation failed', error as Error, { url });
      return { success: false, message: (error as Error).message };
    }
  }

  // -- Pin --

  togglePin(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.state.isPinned = !tab.state.isPinned;
    this.broadcastTabUpdate();
    return tab.state.isPinned;
  }

  // -- Audio --

  toggleMute(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    const muted = !tab.view.webContents.isAudioMuted();
    tab.view.webContents.setAudioMuted(muted);
    tab.state.isMuted = muted;
    this.broadcastTabUpdate();
    return muted;
  }

  // -- Zoom --

  zoomIn(): number {
    const tab = this.getActiveTab();
    if (!tab) return 1;
    const current = tab.view.webContents.getZoomFactor();
    const next = Math.min(current + 0.1, 3);
    tab.view.webContents.setZoomFactor(next);
    return next;
  }

  zoomOut(): number {
    const tab = this.getActiveTab();
    if (!tab) return 1;
    const current = tab.view.webContents.getZoomFactor();
    const next = Math.max(current - 0.1, 0.3);
    tab.view.webContents.setZoomFactor(next);
    return next;
  }

  zoomReset(): number {
    const tab = this.getActiveTab();
    if (!tab) return 1;
    tab.view.webContents.setZoomFactor(1);
    return 1;
  }

  getZoom(): number {
    const tab = this.getActiveTab();
    if (!tab) return 1;
    return tab.view.webContents.getZoomFactor();
  }

  // -- State queries --

  getAllTabStates(): TabState[] {
    return Array.from(this.tabs.values()).map(t => ({ ...t.state }));
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  getActiveTab(): ManagedTab | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs.get(this.activeTabId);
  }

  // -- Cleanup --

  destroy(): void {
    this.logger.info('Destroying TabManager');
    for (const [tabId, tab] of this.tabs) {
      if (this.window && !this.window.isDestroyed()) {
        this.window.removeBrowserView(tab.view);
      }
      (tab.view.webContents as any).destroy?.();
    }
    this.tabs.clear();
    this.activeTabId = null;
    this.window = null;
  }

  // -- Internal --

  private attachWebContentsListeners(tabId: string, view: BrowserView): void {
    const wc = view.webContents;

    wc.on('did-start-loading', () => {
      this.updateTabState(tabId, { isLoading: true });
    });

    wc.on('did-stop-loading', () => {
      this.updateTabState(tabId, { isLoading: false });
    });

    wc.on('did-navigate', (_event, url) => {
      this.updateTabState(tabId, {
        url,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      });

      // Record history visit
      if (this.onNavigateCallback) {
        const title = wc.getTitle() || '';
        this.onNavigateCallback(url, title);
      }

      // Inject force dark mode CSS
      if (this.forceDarkMode?.isEnabled()) {
        wc.insertCSS(this.forceDarkMode.getCSS()).catch(() => {});
      }

      // Inject colorblind mode filter
      if (this.colorblindMode?.getMode() !== 'off') {
        const css = this.colorblindMode!.getCSS();
        const svg = this.colorblindMode!.getSVGFilter();
        if (css) wc.insertCSS(css).catch(() => {});
        if (svg) {
          wc.executeJavaScript(`
            if (!document.getElementById('volary-cb-svg')) {
              const div = document.createElement('div');
              div.id = 'volary-cb-svg';
              div.innerHTML = ${JSON.stringify('PLACEHOLDER')};
              document.body.appendChild(div);
            }
          `.replace('PLACEHOLDER', JSON.stringify(svg).slice(1, -1))).catch(() => {});
        }
      }

      // Inject content scripts for matching extensions
      if (this.contentScriptInjector) {
        this.contentScriptInjector.injectForUrl(wc, url).catch((error) => {
          this.logger.error('Content script injection failed', error as Error, { url });
        });
      }
    });

    wc.on('did-navigate-in-page', (_event, url) => {
      this.updateTabState(tabId, {
        url,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      });
    });

    wc.on('page-title-updated', (_event, title) => {
      this.updateTabState(tabId, { title });
    });

    wc.on('audio-state-changed', (_event, audible: boolean) => {
      this.updateTabState(tabId, { isAudioPlaying: audible });
    });

    wc.on('page-favicon-updated', (_event, favicons) => {
      if (favicons.length > 0) {
        this.updateTabState(tabId, { favicon: favicons[0] });
      }
    });

    // Capture keyboard shortcuts from BrowserView (web content has focus)
    wc.on('before-input-event', (event, input) => {
      if (!this.window || this.window.isDestroyed()) return;
      const mod = input.meta || input.control;
      if (!mod) return;

      if (input.key === 't' && input.type === 'keyDown') {
        event.preventDefault();
        this.createTab({ active: true });
        this.window.webContents.send('focus-address-bar');
      } else if (input.key === 'w' && input.type === 'keyDown') {
        event.preventDefault();
        if (this.activeTabId) this.closeTab(this.activeTabId);
      } else if (input.key === 'l' && input.type === 'keyDown') {
        event.preventDefault();
        this.window.webContents.send('focus-address-bar');
      } else if (input.key === 'f' && input.type === 'keyDown') {
        event.preventDefault();
        this.window.webContents.send('open-find');
      } else if ((input.key === '=' || input.key === '+') && input.type === 'keyDown') {
        event.preventDefault();
        this.zoomIn();
      } else if (input.key === '-' && input.type === 'keyDown') {
        event.preventDefault();
        this.zoomOut();
      } else if (input.key === '0' && input.type === 'keyDown') {
        event.preventDefault();
        this.zoomReset();
      } else if (input.shift && input.key === 'R' && input.type === 'keyDown') {
        event.preventDefault();
        this.window.webContents.send('toggle-reading-mode');
      } else if (input.key === 'p' && input.type === 'keyDown') {
        event.preventDefault();
        wc.print();
      } else if (input.key === ',' && input.type === 'keyDown') {
        event.preventDefault();
        this.window.webContents.send('open-settings');
      }
    });

    // Open target="_blank" links as new tabs
    wc.setWindowOpenHandler(({ url }) => {
      this.createTab({ url, active: true });
      return { action: 'deny' };
    });
  }

  private updateTabState(tabId: string, updates: Partial<TabState>): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    Object.assign(tab.state, updates);
    this.broadcastTabUpdate();
  }

  private broadcastTabUpdate(): void {
    if (!this.window || this.window.isDestroyed()) return;

    const event: TabUpdateEvent = {
      tabs: this.getAllTabStates(),
      activeTabId: this.activeTabId,
    };

    this.window.webContents.send('tab:updated', event);
  }

  private repositionActiveView(): void {
    if (!this.activeTabId || !this.window || this.window.isDestroyed()) return;

    const tab = this.tabs.get(this.activeTabId);
    if (tab) {
      tab.view.setBounds(this.viewBounds);
    }
  }
}
