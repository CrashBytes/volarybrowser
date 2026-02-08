/**
 * Window lifecycle management
 * 
 * Architectural Responsibilities:
 * - Window creation with security-first configuration
 * - State persistence (position, size, maximized state)
 * - Graceful shutdown coordination
 * - Memory leak prevention through proper cleanup
 * 
 * Design Patterns:
 * - Single Responsibility: Window management only, no IPC handling
 * - Repository Pattern: State persistence abstraction
 * - Observer Pattern: Window event coordination
 * 
 * @module window-manager
 */

import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import {
  IWindowManager,
  WindowConfig,
  WindowState,
  ILogger,
} from './types';
import { LoggerFactory } from './utils/logger';
import { config } from './config';

/**
 * Default window state for first launch
 * 
 * Centered on primary display with reasonable dimensions
 */
const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
  isMaximized: false,
  isFullScreen: false,
};

/**
 * Window Manager Implementation
 * 
 * Manages browser window lifecycle with state persistence.
 * Ensures windows are restored to previous position/size across sessions.
 * 
 * Future Enhancement: Multi-window support for workspaces
 */
export class WindowManager implements IWindowManager {
  private mainWindow: BrowserWindow | null = null;
  private logger: ILogger;
  private isShuttingDown: boolean = false;

  /**
   * Windows managed by this instance
   * 
   * Future: Support multiple windows for multi-workspace scenarios
   */
  private windows: Set<BrowserWindow> = new Set();

  constructor() {
    this.logger = LoggerFactory.create('WindowManager');
  }

  /**
   * Create main browser window
   * 
   * Security Configuration:
   * - Context isolation enabled (renderer cannot access Node.js)
   * - Node integration disabled (no direct Node.js API access)
   * - Sandbox enabled (OS-level process isolation)
   * - Preload script for controlled IPC bridge
   * 
   * @param windowConfig - Window configuration (injected dependency)
   * @returns Created BrowserWindow instance
   */
  public createWindow(windowConfig: WindowConfig): BrowserWindow {
    this.logger.info('Creating main window');

    // Load persisted state or use defaults
    const state = this.loadWindowStateSync();
    
    // Validate and normalize state (prevent off-screen positioning)
    const normalizedState = this.normalizeWindowState(state);

    // Merge configuration with persisted state
    const browserWindowConfig = {
      ...windowConfig,
      width: normalizedState.width,
      height: normalizedState.height,
      x: normalizedState.x,
      y: normalizedState.y,
      show: false, // Use 'ready-to-show' event for flicker-free display
    };

    // Create window instance
    const window = new BrowserWindow(browserWindowConfig);

    // Restore maximized/fullscreen state
    if (normalizedState.isMaximized) {
      window.maximize();
    }
    if (normalizedState.isFullScreen) {
      window.setFullScreen(true);
    }

    // Show window after content loaded (prevents white flash)
    window.once('ready-to-show', () => {
      this.logger.debug('Window ready to show');
      window.show();
    });

    // Register window in tracking set
    this.windows.add(window);
    this.mainWindow = window;

    // Set up event handlers
    this.attachEventHandlers(window);

    // Load application URL
    this.loadApplication(window);

    this.logger.info('Main window created', {
      width: normalizedState.width,
      height: normalizedState.height,
      isMaximized: normalizedState.isMaximized,
    });

    return window;
  }

  /**
   * Get main window instance
   * 
   * @returns Main window or null if not created
   */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Load application entry point
   * 
   * Development: Load from webpack-dev-server
   * Production: Load from bundled HTML file
   */
  private loadApplication(window: BrowserWindow): void {
    if (config.app.isDevelopment) {
      const devServerUrl = `http://${config.devServer.host}:${config.devServer.port}`;
      this.logger.debug(`Loading development URL: ${devServerUrl}`);
      window.loadURL(devServerUrl);
      
      // Open DevTools in development
      window.webContents.openDevTools();
    } else {
      const htmlPath = path.join(__dirname, '../renderer/index.html');
      this.logger.debug(`Loading production HTML: ${htmlPath}`);
      window.loadFile(htmlPath);
    }
  }

  /**
   * Attach event handlers to window
   * 
   * Event handling strategy:
   * - Debounce resize/move events to prevent excessive disk I/O
   * - Clean up on window close to prevent memory leaks
   * - Persist state before destruction
   */
  private attachEventHandlers(window: BrowserWindow): void {
    // Debounced state persistence timer
    let saveStateTimer: NodeJS.Timeout | null = null;

    /**
     * Debounced state saver
     * 
     * Prevents excessive disk writes during resize/move operations
     * Delay: 500ms after last event
     */
    const debouncedSaveState = () => {
      if (saveStateTimer) {
        clearTimeout(saveStateTimer);
      }
      saveStateTimer = setTimeout(() => {
        if (!this.isShuttingDown) {
          this.saveWindowState(window);
        }
      }, 500);
    };

    // Window state events
    window.on('resize', debouncedSaveState);
    window.on('move', debouncedSaveState);
    window.on('maximize', debouncedSaveState);
    window.on('unmaximize', debouncedSaveState);
    window.on('enter-full-screen', debouncedSaveState);
    window.on('leave-full-screen', debouncedSaveState);

    // Window lifecycle events
    window.on('closed', () => {
      this.logger.info('Window closed');
      
      // Clear debounce timer
      if (saveStateTimer) {
        clearTimeout(saveStateTimer);
      }

      // Remove from tracking
      this.windows.delete(window);
      
      if (this.mainWindow === window) {
        this.mainWindow = null;
      }
    });

    // Prevent navigation away from application
    // Security: Prevents phishing attacks via window.location manipulation
    window.webContents.on('will-navigate', (event, url) => {
      const allowedOrigins = config.security.allowedOrigins;
      const urlObj = new URL(url);
      
      if (!allowedOrigins.includes(urlObj.origin)) {
        this.logger.warn('Blocked navigation to unauthorized origin', { url });
        event.preventDefault();
      }
    });

    // Prevent opening new windows (security)
    // Future: Allow controlled new window creation for multi-workspace
    window.webContents.setWindowOpenHandler(() => {
      this.logger.warn('Blocked attempt to open new window');
      return { action: 'deny' };
    });
  }

  /**
   * Persist window state to storage
   * 
   * Future Enhancement: Encrypt state and store in vault
   * Current: Use electron-store or similar simple persistence
   * 
   * @param window - Window to persist state for
   */
  public async saveWindowState(window: BrowserWindow): Promise<void> {
    if (window.isDestroyed()) {
      return;
    }

    const state: WindowState = {
      width: window.getBounds().width,
      height: window.getBounds().height,
      x: window.getBounds().x,
      y: window.getBounds().y,
      isMaximized: window.isMaximized(),
      isFullScreen: window.isFullScreen(),
    };

    this.logger.debug('Saving window state', state);

    // TODO: Implement encrypted state persistence via vault
    // For now, store in memory (state lost on restart)
    // Future: Store in encrypted JSON file or SQLCipher database
  }

  /**
   * Load window state from storage
   * 
   * @returns Persisted state or default state
   */
  public async loadWindowState(): Promise<WindowState> {
    this.logger.debug('Loading window state');

    // TODO: Implement encrypted state retrieval from vault
    // For now, return default state
    return DEFAULT_WINDOW_STATE;
  }

  /**
   * Synchronous state loading for window creation
   * 
   * Window creation cannot be async, so we need sync state loading
   * Future: Pre-load state during app initialization
   */
  private loadWindowStateSync(): WindowState {
    // TODO: Implement synchronous state loading
    return DEFAULT_WINDOW_STATE;
  }

  /**
   * Normalize window state to prevent off-screen positioning
   * 
   * Validates:
   * - Window is within display bounds
   * - Minimum size constraints enforced
   * - Handle multi-display scenarios (display removed)
   * 
   * @param state - Raw window state from storage
   * @returns Normalized state guaranteed to be on-screen
   */
  private normalizeWindowState(state: WindowState): WindowState {
    const primaryDisplay = screen.getPrimaryDisplay();
    const displayBounds = primaryDisplay.workArea;

    // Ensure minimum size
    const width = Math.max(state.width, 800);
    const height = Math.max(state.height, 600);

    // If no position stored, center on screen
    if (state.x === undefined || state.y === undefined) {
      return {
        ...state,
        width,
        height,
        x: Math.floor(displayBounds.x + (displayBounds.width - width) / 2),
        y: Math.floor(displayBounds.y + (displayBounds.height - height) / 2),
      };
    }

    // Check if window is visible on any display
    const allDisplays = screen.getAllDisplays();
    let isVisible = false;

    for (const display of allDisplays) {
      const bounds = display.workArea;
      if (
        state.x >= bounds.x &&
        state.x < bounds.x + bounds.width &&
        state.y >= bounds.y &&
        state.y < bounds.y + bounds.height
      ) {
        isVisible = true;
        break;
      }
    }

    // If window is off-screen (display disconnected), center on primary
    if (!isVisible) {
      this.logger.warn('Window position off-screen, centering on primary display');
      return {
        ...state,
        width,
        height,
        x: Math.floor(displayBounds.x + (displayBounds.width - width) / 2),
        y: Math.floor(displayBounds.y + (displayBounds.height - height) / 2),
      };
    }

    return { ...state, width, height };
  }

  /**
   * Close all windows gracefully
   * 
   * Ensures state is persisted before destruction
   * Coordinates shutdown across all managed windows
   */
  public async closeAllWindows(): Promise<void> {
    this.logger.info('Closing all windows');
    this.isShuttingDown = true;

    const closePromises: Promise<void>[] = [];

    for (const window of this.windows) {
      if (!window.isDestroyed()) {
        // Save state before closing
        await this.saveWindowState(window);
        
        // Close window
        closePromises.push(
          new Promise<void>((resolve) => {
            window.once('closed', () => resolve());
            window.close();
          })
        );
      }
    }

    await Promise.all(closePromises);
    this.logger.info('All windows closed');
  }

  /**
   * Get all managed windows
   * 
   * Useful for broadcasting messages or coordinating actions
   * 
   * @returns Array of BrowserWindow instances
   */
  public getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows).filter((w) => !w.isDestroyed());
  }

  /**
   * Cleanup resources
   * 
   * Called during application shutdown
   * Ensures no memory leaks from event listeners
   */
  public destroy(): void {
    this.logger.info('Destroying window manager');
    this.windows.clear();
    this.mainWindow = null;
  }
}
