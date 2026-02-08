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
  private handlers: Map<IPCChannel, HandlerRegistration> = new Map();

  /**
   * Rate limit tracking
   *
   * Key: `${channel}:${senderId}`
   * Value: Array of request timestamps
   */
  private rateLimitMap: Map<string, number[]> = new Map();

  constructor(windowManager: WindowManager, vaultManager: VaultManager, tabManager: TabManager) {
    this.logger = LoggerFactory.create('IPCHandlers');
    this.windowManager = windowManager;
    this.vaultManager = vaultManager;
    this.tabManager = tabManager;
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
      validator: (payload): payload is { fullscreen: boolean } => {
        return (
          typeof payload === 'object' &&
          payload !== null &&
          'fullscreen' in payload &&
          typeof (payload as { fullscreen: unknown }).fullscreen === 'boolean'
        );
      },
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
      validator: (payload): payload is { password: string; authLevel?: number } => {
        return (
          typeof payload === 'object' &&
          payload !== null &&
          'password' in payload &&
          typeof (payload as { password: unknown }).password === 'string' &&
          (!('authLevel' in payload) || 
           typeof (payload as { authLevel: unknown }).authLevel === 'number')
        );
      },
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
      validator: (payload): payload is { password: string } => {
        return (
          typeof payload === 'object' &&
          payload !== null &&
          'password' in payload &&
          typeof (payload as { password: unknown }).password === 'string'
        );
      },
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
      validator: (payload): payload is { url: string } => {
        return (
          typeof payload === 'object' &&
          payload !== null &&
          'url' in payload &&
          typeof (payload as { url: unknown }).url === 'string'
        );
      },
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
      validator: (payload): payload is { tabId: string } => {
        return (
          typeof payload === 'object' &&
          payload !== null &&
          'tabId' in payload &&
          typeof (payload as { tabId: unknown }).tabId === 'string'
        );
      },
    });

    this.register({
      channel: IPCChannel.TAB_SWITCH,
      handler: async (_event, payload: { tabId: string }) => {
        return this.tabManager.switchTab(payload.tabId);
      },
      validator: (payload): payload is { tabId: string } => {
        return (
          typeof payload === 'object' &&
          payload !== null &&
          'tabId' in payload &&
          typeof (payload as { tabId: unknown }).tabId === 'string'
        );
      },
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
      validator: (payload): payload is { x: number; y: number; width: number; height: number } => {
        return (
          typeof payload === 'object' &&
          payload !== null &&
          typeof (payload as any).x === 'number' &&
          typeof (payload as any).y === 'number' &&
          typeof (payload as any).width === 'number' &&
          typeof (payload as any).height === 'number'
        );
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
