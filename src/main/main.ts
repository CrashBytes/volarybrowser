/**
 * Volary Browser - Main Process Entry Point
 * 
 * Application Lifecycle Orchestration:
 * - Coordinates subsystem initialization (window manager, IPC, vault)
 * - Manages application state transitions (ready -> running -> shutdown)
 * - Enforces graceful shutdown with resource cleanup
 * - Implements single-instance application pattern
 * 
 * Architectural Philosophy:
 * - Dependency Injection: Subsystems receive their dependencies explicitly
 * - Fail-Fast: Initialization errors halt startup with clear diagnostics
 * - Observable Lifecycle: Each state transition is logged for debugging
 * - Graceful Degradation: Non-critical failures don't block startup
 * 
 * Security Considerations:
 * - Single instance enforcement prevents session hijacking
 * - Secure defaults applied before any window creation
 * - Certificate validation enforced for all HTTPS connections
 * 
 * @module main
 */

import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';
import { config } from './config';
import { WindowManager } from './window-manager';
import { IPCHandlers } from './ipc-handlers';
import { VaultManager } from './security/vault-manager';
import { TabManager } from './tab-manager';
import { ExtensionManager } from './extensions/extension-manager';
import { LoggerFactory, LogLevel } from './utils/logger';
import { AppLifecycleState, ILogger } from './types';

/**
 * Application Controller
 * 
 * Central orchestrator for application lifecycle.
 * Coordinates initialization, runtime, and shutdown phases.
 * 
 * Design Pattern: Facade
 * - Provides simplified interface to complex subsystem initialization
 * - Hides complexity of startup sequence from external consumers
 */
class VolaryBrowser {
  private logger: ILogger;
  private windowManager: WindowManager;
  private vaultManager: VaultManager;
  private tabManager: TabManager;
  private extensionManager: ExtensionManager;
  private ipcHandlers: IPCHandlers;
  private lifecycleState: AppLifecycleState = AppLifecycleState.INITIALIZING;

  /**
   * Flag to prevent duplicate shutdown sequences
   */
  private isShuttingDown: boolean = false;

  constructor() {
    // Initialize configuration system FIRST (required by all subsystems)
    config.initialize();
    
    // Initialize logger (depends on config for log level)
    this.setupLogging();
    this.logger = LoggerFactory.create('VolaryBrowser');

    this.logger.info('Volary Browser initializing', {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    });

    // Initialize subsystems (dependencies injected)
    this.windowManager = new WindowManager();
    this.vaultManager = new VaultManager();
    this.tabManager = new TabManager();
    this.extensionManager = new ExtensionManager();
    this.ipcHandlers = new IPCHandlers(this.windowManager, this.vaultManager, this.tabManager);

    // Configure application behavior
    this.configureApplicationDefaults();

    // Register lifecycle handlers
    this.registerLifecycleHandlers();
  }

  /**
   * Configure logging system
   * 
   * Development: Verbose debug logging
   * Production: Info level, structured JSON output
   */
  private setupLogging(): void {
    if (config.app.isDevelopment) {
      LoggerFactory.setDefaultLevel(LogLevel.DEBUG);
    } else {
      LoggerFactory.setDefaultLevel(LogLevel.INFO);
    }
  }

  /**
   * Configure application-wide defaults
   * 
   * Security-first configuration:
   * - Disable GPU in headless environments
   * - Enable hardware acceleration where available
   * - Set user agent to avoid fingerprinting
   */
  private configureApplicationDefaults(): void {
    // Disable GPU in CI/headless environments
    if (process.env.CI === 'true' || process.env.HEADLESS === 'true') {
      app.disableHardwareAcceleration();
      this.logger.info('GPU acceleration disabled (headless mode)');
    }

    // Set application name (used in window titles, notifications)
    app.setName(config.app.appName);

    // Set user data path (for consistent data location)
    if (process.env.VOLARY_USER_DATA_PATH) {
      app.setPath('userData', process.env.VOLARY_USER_DATA_PATH);
      this.logger.info('Custom user data path set', {
        path: process.env.VOLARY_USER_DATA_PATH,
      });
    }
  }

  /**
   * Register Electron lifecycle event handlers
   * 
   * Lifecycle phases:
   * 1. ready: App initialized, safe to create windows
   * 2. activate: macOS dock icon clicked (reopen window)
   * 3. window-all-closed: Last window closed (quit on Windows/Linux)
   * 4. before-quit: User initiated quit (save state)
   * 5. will-quit: Final cleanup before termination
   */
  private registerLifecycleHandlers(): void {
    // Application ready - create window and initialize subsystems
    app.on('ready', async () => {
      try {
        await this.onReady();
      } catch (error) {
        this.logger.error('Fatal error during initialization', error as Error);
        app.quit();
      }
    });

    // macOS specific: Reactivate app when dock icon clicked
    app.on('activate', async () => {
      // On macOS, re-create window if none exist
      if (BrowserWindow.getAllWindows().length === 0) {
        this.logger.info('Reactivating application (macOS)');
        await this.createMainWindow();
      }
    });

    // All windows closed - quit application (except macOS)
    app.on('window-all-closed', () => {
      // On macOS, apps stay active until explicitly quit
      if (process.platform !== 'darwin') {
        this.logger.info('All windows closed, quitting application');
        app.quit();
      }
    });

    // Before quit - persist state and cleanup
    app.on('before-quit', async (event) => {
      if (!this.isShuttingDown) {
        event.preventDefault();
        await this.onBeforeQuit();
      }
    });

    // Will quit - final cleanup
    app.on('will-quit', () => {
      this.onWillQuit();
    });

    // Render process crash - log and potentially recover
    app.on('render-process-gone', (event, webContents, details) => {
      this.logger.error('Renderer process crashed', undefined, {
        reason: details.reason,
        exitCode: details.exitCode,
      });

      // TODO: Implement crash recovery
      // - Show error dialog to user
      // - Offer to restart or send crash report
      // - Save current state before recovery
    });

    // Child process crash - log for diagnostics
    app.on('child-process-gone', (event, details) => {
      this.logger.error('Child process crashed', undefined, {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        name: details.name,
      });
    });
  }

  /**
   * Application ready handler
   * 
   * Initialization sequence:
   * 1. Initialize configuration
   * 2. Configure security settings
   * 3. Initialize IPC handlers
   * 4. Create main window
   * 5. Load application UI
   * 
   * Critical Path: Any failure here should halt startup
   */
  private async onReady(): Promise<void> {
    this.logger.info('Application ready, initializing subsystems');
    this.lifecycleState = AppLifecycleState.READY;

    try {
      // Configuration already initialized in constructor
      this.logger.debug('Configuration ready', {
        isDevelopment: config.app.isDevelopment,
        userDataPath: config.app.userDataPath,
      });

      // Configure security policies
      await this.configureSecurityPolicies();

      // Initialize IPC communication layer
      this.ipcHandlers.initialize();
      this.logger.debug('IPC handlers initialized');

      // Create main application window
      await this.createMainWindow();
      this.lifecycleState = AppLifecycleState.WINDOW_CREATED;

      // Connect TabManager to the main window and create initial tab
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        this.tabManager.setWindow(mainWindow);
        await this.tabManager.createTab({ active: true });
        this.logger.debug('Tab manager initialized with initial tab');
      }

      // Initialize vault manager (encrypted storage)
      await this.vaultManager.initialize();
      this.logger.debug('Vault manager initialized');

      // Initialize extension system
      await this.extensionManager.initialize();
      this.tabManager.setContentScriptInjector(
        this.extensionManager.getContentScriptInjector()
      );
      this.logger.debug('Extension manager initialized', {
        extensionCount: this.extensionManager.getAllExtensions().length,
      });

      this.logger.info('Volary Browser started successfully');
    } catch (error) {
      this.logger.error('Failed to initialize application', error as Error);
      throw error;
    }
  }

  /**
   * Configure security policies
   * 
   * Enforces:
   * - Content Security Policy (CSP)
   * - Certificate validation
   * - Permission request handling
   * - WebRequest filtering (future: ad/tracker blocking)
   */
  private async configureSecurityPolicies(): Promise<void> {
    this.logger.debug('Configuring security policies');

    const defaultSession = session.defaultSession;

    // Set Content Security Policy
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [config.security.contentSecurityPolicy],
        },
      });
    });

    // Certificate validation (enforce HTTPS)
    defaultSession.setCertificateVerifyProc((request, callback) => {
      // In development, allow self-signed certs for localhost
      if (config.app.isDevelopment && request.hostname === 'localhost') {
        callback(0); // Accept
        return;
      }

      // Production: Strict certificate validation
      // -3 = Use Chromium's default verification
      callback(-3);
    });

    // Permission request handler
    defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      this.logger.debug('Permission requested', {
        permission,
        url: webContents.getURL(),
      });

      // TODO: Implement user-facing permission dialog
      // For now, deny all permissions except safe ones
      const allowedPermissions = ['notifications'];
      
      callback(allowedPermissions.includes(permission));
    });

    // Future: WebRequest filtering for ad/tracker blocking
    // defaultSession.webRequest.onBeforeRequest((details, callback) => {
    //   // Check URL against blocklist
    //   // callback({ cancel: shouldBlock });
    // });

    this.logger.debug('Security policies configured');
  }

  /**
   * Create main application window
   * 
   * Window creation is deferred until app is ready to ensure:
   * - User data path is available
   * - Security policies are applied
   * - IPC handlers are registered
   */
  private async createMainWindow(): Promise<void> {
    this.logger.info('Creating main window');

    const windowConfig = config.window;
    const mainWindow = this.windowManager.createWindow(windowConfig);

    // Window created successfully
    this.logger.info('Main window created', {
      width: windowConfig.width,
      height: windowConfig.height,
    });

    // Development: Install React DevTools
    if (config.app.isDevelopment) {
      try {
        // Uncomment when React DevTools extension is added
        // const { default: installExtension, REACT_DEVELOPER_TOOLS } = await import('electron-devtools-installer');
        // await installExtension(REACT_DEVELOPER_TOOLS);
        // this.logger.debug('React DevTools installed');
      } catch (error) {
        this.logger.warn('Failed to install React DevTools', error as Error);
      }
    }
  }

  /**
   * Before quit handler
   * 
   * Graceful shutdown sequence:
   * 1. Mark shutdown in progress (prevent duplicate calls)
   * 2. Close all windows (saves state)
   * 3. Flush encrypted vault to disk
   * 4. Cleanup resources
   * 5. Allow quit to proceed
   */
  private async onBeforeQuit(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.lifecycleState = AppLifecycleState.SHUTTING_DOWN;

    this.logger.info('Application shutting down');

    try {
      // Destroy extensions and tabs before closing windows
      this.extensionManager.destroy();
      this.tabManager.destroy();
      this.logger.debug('Tab and extension managers destroyed');

      // Close all windows gracefully (saves state)
      await this.windowManager.closeAllWindows();
      this.logger.debug('All windows closed');

      // Lock vault and cleanup
      this.vaultManager.lock();
      this.logger.debug('Vault locked');

      this.logger.info('Graceful shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', error as Error);
    } finally {
      // Allow quit to proceed
      app.quit();
    }
  }

  /**
   * Will quit handler
   * 
   * Final cleanup before process termination
   * Synchronous only (async not supported at this stage)
   */
  private onWillQuit(): void {
    this.lifecycleState = AppLifecycleState.TERMINATED;

    // Destroy subsystems
    this.ipcHandlers.destroy();
    this.extensionManager.destroy();
    this.tabManager.destroy();
    this.vaultManager.destroy();
    this.windowManager.destroy();

    this.logger.info('Volary Browser terminated');
  }

  /**
   * Get current lifecycle state
   * 
   * Useful for debugging and state-dependent logic
   */
  public getLifecycleState(): AppLifecycleState {
    return this.lifecycleState;
  }
}

/**
 * Single instance enforcement
 * 
 * Prevents multiple instances of the browser from running.
 * Security: Prevents session confusion and data corruption.
 * UX: Focuses existing window instead of launching duplicate.
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running
  console.log('Another instance of Volary Browser is already running');
  app.quit();
} else {
  // We are the primary instance
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // User tried to run a second instance - focus existing window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  // Create application instance
  new VolaryBrowser();
}

/**
 * Unhandled error handlers
 * 
 * Last resort error handling to prevent silent failures
 * Logs errors for diagnostics and debugging
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // In production, send to crash reporting service
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // In production, log to monitoring service
});
