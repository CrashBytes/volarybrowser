/**
 * IPC (Inter-Process Communication) Handlers
 * 
 * Architectural Role:
 * - Boundary layer between renderer and main process
 * - Security enforcement point (validate all renderer requests)
 * - Type-safe message routing
 * - Request/response coordination
 * 
 * Security Model:
 * - Never trust renderer input (validate everything)
 * - Whitelist pattern: Explicit allowed channels only
 * - Rate limiting on sensitive operations
 * - Audit logging for security-critical actions
 * 
 * Design Patterns:
 * - Command Pattern: Each IPC channel is a command
 * - Chain of Responsibility: Handler chain with validation
 * - Observer Pattern: Event emission to renderer
 * 
 * @module ipc-handlers
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { IPCChannel, ILogger } from './types';
import { LoggerFactory } from './utils/logger';
import { WindowManager } from './window-manager';
import { VaultManager } from './security/vault-manager';
import { TabManager } from './tab-manager';
import { HistoryManager } from './history-manager';
import { DownloadManager } from './download-manager';
import { FindInPage } from './find-in-page';
import {
  windowFullscreenSchema,
  vaultInitializeSchema,
  vaultUnlockSchema,
  navNavigateToSchema,
  tabCloseSchema,
  tabSwitchSchema,
  tabUpdateBoundsSchema,
  historySearchSchema,
  historyGetRecentSchema,
  historyDeleteSchema,
  bookmarkCreateSchema,
  bookmarkDeleteSchema,
  bookmarkUpdateSchema,
  bookmarkMoveSchema,
  bookmarkGetTreeSchema,
  bookmarkGetChildrenSchema,
  bookmarkIsBookmarkedSchema,
  bookmarkSearchSchema,
  downloadActionSchema,
  settingsGetSchema,
  settingsSetSchema,
  findStartSchema,
  zodValidator,
} from './schemas/ipc-schemas';
import {
  createBookmark, deleteBookmark, updateBookmark, moveBookmark,
  getBookmarkTree, getChildren, isBookmarked, searchBookmarks,
} from '../../core/storage/repositories/bookmarks';
import { getSetting, setSetting, getAllSettings } from '../../core/storage/repositories/settings';
import { saveSession, listSessions, getSession, deleteSession } from '../../core/storage/repositories/sessions';
import { ExtensionManager } from './extensions/extension-manager';
import { ReadingMode } from './reading-mode';
import { ForceDarkMode } from './privacy/force-dark-mode';
import { ColorblindMode } from './privacy/colorblind-mode';

/**
 * IPC Handler function signature
 * 
 * Async by default to support database operations and async workflows
 */
type IPCHandler<T = unknown, R = unknown> = (
  event: IpcMainInvokeEvent,
  payload: T
) => Promise<R> | R;

/**
 * IPC request validator
 * 
 * Validates payload structure before handler execution
 * Prevents type coercion attacks and malformed requests
 */
type IPCValidator<T = unknown> = (payload: unknown) => payload is T;

/**
 * Handler registration entry
 * 
 * Combines handler, validator, and metadata for comprehensive routing
 */
interface HandlerRegistration<T = unknown, R = unknown> {
  channel: IPCChannel;
  handler: IPCHandler<T, R>;
  validator?: IPCValidator<T>;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * IPC Communication Bridge
 * 
 * Central coordinator for main/renderer process communication.
 * Implements security controls, validation, and structured error handling.
 * 
 * Future Enhancements:
 * - Request queuing for rate-limited operations
 * - Distributed tracing for IPC calls
 * - Performance metrics collection
 */
export class IPCHandlers {
  private logger: ILogger;
  private windowManager: WindowManager;
  private vaultManager: VaultManager;
  private tabManager: TabManager;
  private historyManager: HistoryManager;
  private downloadManager: DownloadManager;
  private extensionManager: ExtensionManager;
  private readingMode: ReadingMode;
  private forceDarkMode: ForceDarkMode;
  private colorblindMode: ColorblindMode;
  private findInPage: FindInPage;
  private handlers: Map<IPCChannel, HandlerRegistration> = new Map();

  /**
   * Rate limit tracking
   *
   * Key: `${channel}:${senderId}`
   * Value: Array of request timestamps
   */
  private rateLimitMap: Map<string, number[]> = new Map();

  constructor(
    windowManager: WindowManager,
    vaultManager: VaultManager,
    tabManager: TabManager,
    historyManager: HistoryManager,
    downloadManager: DownloadManager,
    extensionManager: ExtensionManager,
    readingMode: ReadingMode,
    forceDarkMode: ForceDarkMode,
    colorblindMode: ColorblindMode,
  ) {
    this.logger = LoggerFactory.create('IPCHandlers');
    this.windowManager = windowManager;
    this.vaultManager = vaultManager;
    this.tabManager = tabManager;
    this.historyManager = historyManager;
    this.downloadManager = downloadManager;
    this.extensionManager = extensionManager;
    this.readingMode = readingMode;
    this.forceDarkMode = forceDarkMode;
    this.colorblindMode = colorblindMode;
    this.findInPage = new FindInPage(tabManager);
  }

  /**
   * Initialize IPC handlers
   * 
   * Registers all command handlers with validation and rate limiting
   * Call after app is ready but before windows are created
   */
  public initialize(): void {
    this.logger.info('Initializing IPC handlers');

    // Register window management handlers
    this.registerWindowHandlers();

    // Register vault handlers (placeholder for future implementation)
    this.registerVaultHandlers();

    // Register navigation handlers
    this.registerNavigationHandlers();

    // Register tab management handlers
    this.registerTabHandlers();

    // Register history handlers
    this.registerHistoryHandlers();

    // Register bookmark handlers
    this.registerBookmarkHandlers();

    // Register download handlers
    this.registerDownloadHandlers();

    // Register settings handlers
    this.registerSettingsHandlers();

    // Register find-in-page handlers
    this.registerFindHandlers();

    // Register zoom handlers
    this.registerZoomHandlers();

    // Register reading mode / dark mode handlers
    this.registerViewHandlers();

    // Register session handlers
    this.registerSessionHandlers();

    // Register extension handlers
    this.registerExtensionHandlers();

    this.logger.info(`Registered ${this.handlers.size} IPC handlers`);
  }

  /**
   * Register a handler with validation and rate limiting
   * 
   * @param registration - Handler registration configuration
   */
  private register<T = unknown, R = unknown>(
    registration: HandlerRegistration<T, R>
  ): void {
    const { channel, handler, validator, rateLimit } = registration;

    // Wrap handler with validation and rate limiting
    const wrappedHandler = async (
      event: IpcMainInvokeEvent,
      payload: unknown
    ): Promise<R> => {
      const startTime = Date.now();
      
      try {
        // Rate limit check
        if (rateLimit && !this.checkRateLimit(event, channel, rateLimit)) {
          this.logger.warn('Rate limit exceeded', {
            channel,
            senderId: event.sender.id,
          });
          throw new Error('Rate limit exceeded');
        }

        // Payload validation
        if (validator && !validator(payload)) {
          this.logger.warn('Invalid payload', { channel, payload });
          throw new Error('Invalid payload structure');
        }

        // Execute handler
        this.logger.debug('IPC handler invoked', { channel });
        const result = await handler(event, payload as T);
        
        const duration = Date.now() - startTime;
        this.logger.debug('IPC handler completed', { channel, duration });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        this.logger.error('IPC handler error', error as Error, {
          channel,
          duration,
        });
        throw error;
      }
    };

    // Register with Electron's IPC system
    ipcMain.handle(channel, wrappedHandler);
    this.handlers.set(channel, registration);

    this.logger.debug('Registered IPC handler', { channel });
  }

  /**
   * Check rate limit for request
   * 
   * Implements sliding window rate limiting
   * 
   * @returns true if request allowed, false if rate limit exceeded
   */
  private checkRateLimit(
    event: IpcMainInvokeEvent,
    channel: IPCChannel,
    limit: { maxRequests: number; windowMs: number }
  ): boolean {
    const key = `${channel}:${event.sender.id}`;
    const now = Date.now();
    const windowStart = now - limit.windowMs;

    // Get existing requests
    const requests = this.rateLimitMap.get(key) || [];

    // Filter to window
    const recentRequests = requests.filter((timestamp) => timestamp > windowStart);

    // Check limit
    if (recentRequests.length >= limit.maxRequests) {
      return false;
    }

    // Record request
    recentRequests.push(now);
    this.rateLimitMap.set(key, recentRequests);

    return true;
  }

  /**
   * Register window management handlers
   * 
   * Handlers for window operations (minimize, maximize, close, fullscreen)
   */
  private registerWindowHandlers(): void {
    // Minimize window
    this.register({
      channel: IPCChannel.WINDOW_MINIMIZE,
      handler: (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && !window.isDestroyed()) {
          window.minimize();
        }
      },
    });

    // Maximize/restore window
    this.register({
      channel: IPCChannel.WINDOW_MAXIMIZE,
      handler: (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && !window.isDestroyed()) {
          if (window.isMaximized()) {
            window.unmaximize();
          } else {
            window.maximize();
          }
        }
      },
    });

    // Close window
    this.register({
      channel: IPCChannel.WINDOW_CLOSE,
      handler: (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && !window.isDestroyed()) {
          window.close();
        }
      },
    });

    // Toggle fullscreen
    this.register({
      channel: IPCChannel.WINDOW_FULLSCREEN,
      handler: (event, payload: { fullscreen: boolean }) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && !window.isDestroyed()) {
          window.setFullScreen(payload.fullscreen);
        }
      },
      validator: zodValidator(windowFullscreenSchema),
    });
  }

  /**
   * Register vault handlers
   * 
   * Security-critical operations with strict rate limiting
   * Integrated with VaultManager for full encryption functionality
   */
  private registerVaultHandlers(): void {
    // Vault initialization (first-time setup)
    this.register({
      channel: IPCChannel.VAULT_INITIALIZE,
      handler: async (event, payload: { password: string; authLevel?: number }) => {
        this.logger.info('Vault initialization requested', { 
          authLevel: payload.authLevel || 1 
        });
        
        const result = await this.vaultManager.initializeVault(
          payload.password,
          payload.authLevel as any || 1
        );
        
        // Broadcast status change to all windows
        if (result.success) {
          const status = this.vaultManager.getStatus();
          this.send('vault:status-changed', status);
        }
        
        return result;
      },
      validator: zodValidator(vaultInitializeSchema),
      rateLimit: {
        maxRequests: 3, // 3 attempts
        windowMs: 300000, // per 5 minutes
      },
    });

    // Vault unlock
    this.register({
      channel: IPCChannel.VAULT_UNLOCK,
      handler: async (event, payload: { password: string }) => {
        this.logger.info('Vault unlock requested');
        
        const result = await this.vaultManager.unlock(payload.password);
        
        // Broadcast status change to all windows
        if (result.success) {
          const status = this.vaultManager.getStatus();
          this.send('vault:status-changed', status);
        }
        
        return result;
      },
      validator: zodValidator(vaultUnlockSchema),
      rateLimit: {
        maxRequests: 5, // 5 attempts
        windowMs: 60000, // per minute
      },
    });

    // Vault lock
    this.register({
      channel: IPCChannel.VAULT_LOCK,
      handler: async (event) => {
        this.logger.info('Vault lock requested');
        
        const result = this.vaultManager.lock();
        
        // Broadcast status change to all windows
        const status = this.vaultManager.getStatus();
        this.send('vault:status-changed', status);
        
        return result;
      },
    });

    // Vault status query
    this.register({
      channel: IPCChannel.VAULT_STATUS,
      handler: async (event) => {
        return this.vaultManager.getStatus();
      },
    });
  }

  /**
   * Register navigation handlers
   *
   * Delegates to TabManager to operate on the active tab's webContents
   */
  private registerNavigationHandlers(): void {
    this.register({
      channel: IPCChannel.NAV_GO_BACK,
      handler: () => {
        this.tabManager.goBack();
      },
    });

    this.register({
      channel: IPCChannel.NAV_GO_FORWARD,
      handler: () => {
        this.tabManager.goForward();
      },
    });

    this.register({
      channel: IPCChannel.NAV_RELOAD,
      handler: () => {
        this.tabManager.reload();
      },
    });

    this.register({
      channel: IPCChannel.NAV_NAVIGATE_TO,
      handler: async (_event, payload: { url: string }) => {
        this.logger.debug('Navigation requested', { url: payload.url });
        return this.tabManager.navigate(payload.url);
      },
      validator: zodValidator(navNavigateToSchema),
    });
  }

  /**
   * Register tab management handlers
   *
   * Delegates to TabManager for multi-tab browsing
   */
  private registerTabHandlers(): void {
    this.register({
      channel: IPCChannel.TAB_CREATE,
      handler: async (_event, payload: { url?: string }) => {
        return this.tabManager.createTab({ url: payload?.url });
      },
    });

    this.register({
      channel: IPCChannel.TAB_CLOSE,
      handler: async (_event, payload: { tabId: string }) => {
        return this.tabManager.closeTab(payload.tabId);
      },
      validator: zodValidator(tabCloseSchema),
    });

    this.register({
      channel: IPCChannel.TAB_SWITCH,
      handler: async (_event, payload: { tabId: string }) => {
        return this.tabManager.switchTab(payload.tabId);
      },
      validator: zodValidator(tabSwitchSchema),
    });

    this.register({
      channel: IPCChannel.TAB_GET_ALL,
      handler: async () => {
        return {
          tabs: this.tabManager.getAllTabStates(),
          activeTabId: this.tabManager.getActiveTabId(),
        };
      },
    });

    this.register({
      channel: IPCChannel.TAB_UPDATE_BOUNDS,
      handler: (_event, payload: { x: number; y: number; width: number; height: number }) => {
        this.tabManager.updateBounds(payload);
      },
      validator: zodValidator(tabUpdateBoundsSchema),
    });

    this.register({
      channel: IPCChannel.TAB_TOGGLE_MUTE,
      handler: async (_event, payload: { tabId: string }) => {
        const muted = this.tabManager.toggleMute(payload.tabId);
        return { muted };
      },
    });
  }

  // -- History --

  private registerHistoryHandlers(): void {
    this.register({
      channel: IPCChannel.HISTORY_SEARCH,
      handler: async (_event, payload: { query: string; limit?: number }) => {
        return this.historyManager.search(payload.query, payload.limit);
      },
      validator: zodValidator(historySearchSchema),
    });

    this.register({
      channel: IPCChannel.HISTORY_GET_RECENT,
      handler: async (_event, payload: { limit?: number }) => {
        return this.historyManager.getRecent(payload?.limit);
      },
    });

    this.register({
      channel: IPCChannel.HISTORY_DELETE,
      handler: async (_event, payload: { id: number }) => {
        this.historyManager.deleteEntry(payload.id);
        return { success: true };
      },
      validator: zodValidator(historyDeleteSchema),
    });

    this.register({
      channel: IPCChannel.HISTORY_CLEAR,
      handler: async () => {
        this.historyManager.clearAll();
        return { success: true };
      },
    });
  }

  // -- Bookmarks --

  private registerBookmarkHandlers(): void {
    this.register({
      channel: IPCChannel.BOOKMARK_CREATE,
      handler: async (_event, payload: { parentId: number; title: string; url: string | null; isFolder?: boolean }) => {
        const id = createBookmark(payload.parentId, payload.title, payload.url, payload.isFolder);
        return { success: true, id };
      },
      validator: zodValidator(bookmarkCreateSchema),
    });

    this.register({
      channel: IPCChannel.BOOKMARK_DELETE,
      handler: async (_event, payload: { id: number }) => {
        deleteBookmark(payload.id);
        return { success: true };
      },
      validator: zodValidator(bookmarkDeleteSchema),
    });

    this.register({
      channel: IPCChannel.BOOKMARK_UPDATE,
      handler: async (_event, payload: { id: number; title?: string; url?: string }) => {
        updateBookmark(payload.id, payload.title, payload.url);
        return { success: true };
      },
      validator: zodValidator(bookmarkUpdateSchema),
    });

    this.register({
      channel: IPCChannel.BOOKMARK_MOVE,
      handler: async (_event, payload: { id: number; newParentId: number; newPosition: number }) => {
        moveBookmark(payload.id, payload.newParentId, payload.newPosition);
        return { success: true };
      },
      validator: zodValidator(bookmarkMoveSchema),
    });

    this.register({
      channel: IPCChannel.BOOKMARK_GET_TREE,
      handler: async (_event, payload: { rootId: number }) => {
        return getBookmarkTree(payload.rootId);
      },
      validator: zodValidator(bookmarkGetTreeSchema),
    });

    this.register({
      channel: IPCChannel.BOOKMARK_GET_CHILDREN,
      handler: async (_event, payload: { parentId: number }) => {
        return getChildren(payload.parentId);
      },
      validator: zodValidator(bookmarkGetChildrenSchema),
    });

    this.register({
      channel: IPCChannel.BOOKMARK_IS_BOOKMARKED,
      handler: async (_event, payload: { url: string }) => {
        return isBookmarked(payload.url);
      },
      validator: zodValidator(bookmarkIsBookmarkedSchema),
    });

    this.register({
      channel: IPCChannel.BOOKMARK_SEARCH,
      handler: async (_event, payload: { query: string; limit?: number }) => {
        return searchBookmarks(payload.query, payload.limit);
      },
      validator: zodValidator(bookmarkSearchSchema),
    });
  }

  // -- Downloads --

  private registerDownloadHandlers(): void {
    this.register({
      channel: IPCChannel.DOWNLOAD_GET_ALL,
      handler: async () => this.downloadManager.getAllDownloads(),
    });

    this.register({
      channel: IPCChannel.DOWNLOAD_PAUSE,
      handler: async (_event, payload: { id: string }) => {
        return { success: this.downloadManager.pause(payload.id) };
      },
      validator: zodValidator(downloadActionSchema),
    });

    this.register({
      channel: IPCChannel.DOWNLOAD_RESUME,
      handler: async (_event, payload: { id: string }) => {
        return { success: this.downloadManager.resume(payload.id) };
      },
      validator: zodValidator(downloadActionSchema),
    });

    this.register({
      channel: IPCChannel.DOWNLOAD_CANCEL,
      handler: async (_event, payload: { id: string }) => {
        return { success: this.downloadManager.cancel(payload.id) };
      },
      validator: zodValidator(downloadActionSchema),
    });
  }

  // -- Settings --

  private registerSettingsHandlers(): void {
    this.register({
      channel: IPCChannel.SETTINGS_GET,
      handler: async (_event, payload: { key: string; defaultValue?: unknown }) => {
        return getSetting(payload.key, payload.defaultValue ?? null);
      },
      validator: zodValidator(settingsGetSchema),
    });

    this.register({
      channel: IPCChannel.SETTINGS_SET,
      handler: async (_event, payload: { key: string; value: unknown }) => {
        setSetting(payload.key, payload.value);
        return { success: true };
      },
      validator: zodValidator(settingsSetSchema),
    });

    this.register({
      channel: IPCChannel.SETTINGS_GET_ALL,
      handler: async () => getAllSettings(),
    });
  }

  // -- Find in Page --

  private registerFindHandlers(): void {
    this.register({
      channel: IPCChannel.FIND_START,
      handler: async (_event, payload: { text: string; forward?: boolean }) => {
        return this.findInPage.find(payload.text, payload.forward);
      },
      validator: zodValidator(findStartSchema),
    });

    this.register({
      channel: IPCChannel.FIND_NEXT,
      handler: async () => this.findInPage.findNext(),
    });

    this.register({
      channel: IPCChannel.FIND_PREVIOUS,
      handler: async () => this.findInPage.findPrevious(),
    });

    this.register({
      channel: IPCChannel.FIND_STOP,
      handler: async () => {
        this.findInPage.stop();
        return { success: true };
      },
    });
  }

  // -- Zoom --

  private registerZoomHandlers(): void {
    this.register({
      channel: IPCChannel.ZOOM_IN,
      handler: async () => ({ zoom: this.tabManager.zoomIn() }),
    });
    this.register({
      channel: IPCChannel.ZOOM_OUT,
      handler: async () => ({ zoom: this.tabManager.zoomOut() }),
    });
    this.register({
      channel: IPCChannel.ZOOM_RESET,
      handler: async () => ({ zoom: this.tabManager.zoomReset() }),
    });
    this.register({
      channel: IPCChannel.ZOOM_GET,
      handler: async () => ({ zoom: this.tabManager.getZoom() }),
    });
  }

  // -- Reading Mode & Dark Mode --

  private registerViewHandlers(): void {
    this.register({
      channel: IPCChannel.READING_MODE_TOGGLE,
      handler: async () => this.readingMode.toggle(),
    });

    this.register({
      channel: IPCChannel.DARK_MODE_TOGGLE,
      handler: async () => {
        const enabled = this.forceDarkMode.toggle();
        return { enabled };
      },
    });

    this.register({
      channel: IPCChannel.DARK_MODE_STATUS,
      handler: async () => ({ enabled: this.forceDarkMode.isEnabled() }),
    });

    this.register({
      channel: IPCChannel.COLORBLIND_CYCLE,
      handler: async () => {
        const mode = this.colorblindMode.cycle();
        return { mode, label: this.colorblindMode.getLabel() };
      },
    });

    this.register({
      channel: IPCChannel.COLORBLIND_SET,
      handler: async (_event, payload: { mode: string }) => {
        this.colorblindMode.setMode(payload.mode as any);
        return { mode: this.colorblindMode.getMode(), label: this.colorblindMode.getLabel() };
      },
    });

    this.register({
      channel: IPCChannel.COLORBLIND_STATUS,
      handler: async () => ({
        mode: this.colorblindMode.getMode(),
        label: this.colorblindMode.getLabel(),
      }),
    });
  }

  // -- Sessions --

  private registerSessionHandlers(): void {
    this.register({
      channel: IPCChannel.SESSION_SAVE,
      handler: async (_event, payload: { name: string }) => {
        const tabs = this.tabManager.getAllTabStates();
        const id = saveSession(payload.name, tabs.map(t => ({ url: t.url, title: t.title })));
        return { success: true, id };
      },
    });

    this.register({
      channel: IPCChannel.SESSION_LIST,
      handler: async () => listSessions(),
    });

    this.register({
      channel: IPCChannel.SESSION_RESTORE,
      handler: async (_event, payload: { id: number }) => {
        const session = getSession(payload.id);
        if (!session) return { success: false };
        for (const tab of session.tabs) {
          await this.tabManager.createTab({ url: tab.url, active: false });
        }
        return { success: true, tabCount: session.tabs.length };
      },
    });

    this.register({
      channel: IPCChannel.SESSION_DELETE,
      handler: async (_event, payload: { id: number }) => {
        deleteSession(payload.id);
        return { success: true };
      },
    });
  }

  // -- Extensions --

  private registerExtensionHandlers(): void {
    this.register({
      channel: IPCChannel.EXTENSION_GET_ALL,
      handler: async () => this.extensionManager.getAllExtensionInfo(),
    });

    this.register({
      channel: IPCChannel.EXTENSION_TOGGLE,
      handler: async (_event, payload: { id: string }) => {
        const enabled = this.extensionManager.toggleExtension(payload.id);
        return { success: true, enabled };
      },
    });

    this.register({
      channel: IPCChannel.EXTENSION_REMOVE,
      handler: async (_event, payload: { id: string }) => {
        const removed = await this.extensionManager.removeExtension(payload.id);
        return { success: removed };
      },
    });

    this.register({
      channel: IPCChannel.EXTENSION_LOAD,
      handler: async (_event, payload: { path: string }) => {
        const ext = await this.extensionManager.loadExtension(payload.path);
        return { success: !!ext, id: ext?.id };
      },
    });
  }

  /**
   * Send message from main to renderer
   *
   * Broadcasts events to all windows or specific window
   * 
   * @param channel - Event channel
   * @param payload - Event data
   * @param targetWindow - Specific window or null for broadcast
   */
  public send(channel: string, payload: unknown, targetWindow?: BrowserWindow): void {
    if (targetWindow) {
      targetWindow.webContents.send(channel, payload);
    } else {
      // Broadcast to all windows
      const windows = this.windowManager.getAllWindows();
      for (const window of windows) {
        window.webContents.send(channel, payload);
      }
    }
  }

  /**
   * Cleanup IPC handlers
   * 
   * Removes all registered handlers to prevent memory leaks
   */
  public destroy(): void {
    this.logger.info('Destroying IPC handlers');

    for (const [channel] of this.handlers) {
      ipcMain.removeHandler(channel);
    }

    this.handlers.clear();
    this.rateLimitMap.clear();
  }
}
