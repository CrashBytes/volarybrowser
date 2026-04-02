/**
 * Core type definitions for Volary Browser main process
 * 
 * Design Philosophy:
 * - Explicit over implicit: Every interface documents its contract
 * - Type safety as documentation: Types encode business rules
 * - Immutability by default: Readonly properties prevent accidental mutation
 * 
 * @module types
 */

import { BrowserWindow } from 'electron';

/**
 * Window configuration contract
 * 
 * Immutable configuration prevents runtime state corruption.
 * All fields readonly to enforce configuration-as-data principle.
 */
export interface WindowConfig {
  readonly width: number;
  readonly height: number;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly frame: boolean;
  readonly transparent: boolean;
  readonly webPreferences: WebPreferencesConfig;
  readonly backgroundColor: string;
  readonly title: string;
}

/**
 * Web preferences configuration
 * 
 * Security-first configuration:
 * - contextIsolation: true (prevents renderer from accessing Node.js)
 * - nodeIntegration: false (blocks direct Node.js API access)
 * - sandbox: true (OS-level process isolation)
 */
export interface WebPreferencesConfig {
  readonly preload: string;
  readonly contextIsolation: boolean;
  readonly nodeIntegration: boolean;
  readonly sandbox: boolean;
  readonly webSecurity: boolean;
  readonly allowRunningInsecureContent: boolean;
}

/**
 * Window state for persistence across sessions
 * 
 * State stored in encrypted vault (see core/security/vault.ts)
 * Coordinates normalized to prevent off-screen positioning
 */
export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

/**
 * Window manager contract
 * 
 * Single Responsibility: Manages window lifecycle only
 * Depends on abstractions (WindowConfig) not concretions
 */
export interface IWindowManager {
  /**
   * Create a new browser window with given configuration
   * @returns BrowserWindow instance with state tracking attached
   */
  createWindow(config: WindowConfig): BrowserWindow;
  
  /**
   * Retrieve main application window
   * @returns Main window or null if not yet created
   */
  getMainWindow(): BrowserWindow | null;
  
  /**
   * Persist window state to encrypted storage
   * Called on window close, resize, move events
   */
  saveWindowState(window: BrowserWindow): Promise<void>;
  
  /**
   * Restore window state from encrypted storage
   * @returns Saved state or default state if none exists
   */
  loadWindowState(): Promise<WindowState>;
  
  /**
   * Gracefully close all windows
   * Ensures state persistence before destruction
   */
  closeAllWindows(): Promise<void>;
}

/**
 * IPC channel identifiers
 * 
 * Centralized channel registry prevents typos and enables refactoring
 * Convention: <domain>:<action> namespace pattern
 */
export enum IPCChannel {
  // Window management
  WINDOW_MINIMIZE = 'window:minimize',
  WINDOW_MAXIMIZE = 'window:maximize',
  WINDOW_CLOSE = 'window:close',
  WINDOW_FULLSCREEN = 'window:fullscreen',
  
  // Security vault
  VAULT_INITIALIZE = 'vault:initialize',
  VAULT_UNLOCK = 'vault:unlock',
  VAULT_LOCK = 'vault:lock',
  VAULT_STATUS = 'vault:status',
  
  // Navigation
  NAV_GO_BACK = 'nav:back',
  NAV_GO_FORWARD = 'nav:forward',
  NAV_RELOAD = 'nav:reload',
  NAV_NAVIGATE_TO = 'nav:navigate',
  
  // Tab management
  TAB_CREATE = 'tab:create',
  TAB_CLOSE = 'tab:close',
  TAB_SWITCH = 'tab:switch',
  TAB_GET_ALL = 'tab:get-all',
  TAB_UPDATE_BOUNDS = 'tab:update-bounds',
  
  // History
  HISTORY_SEARCH = 'history:search',
  HISTORY_GET_RECENT = 'history:get-recent',
  HISTORY_DELETE = 'history:delete',
  HISTORY_CLEAR = 'history:clear',

  // Bookmarks
  BOOKMARK_CREATE = 'bookmark:create',
  BOOKMARK_DELETE = 'bookmark:delete',
  BOOKMARK_UPDATE = 'bookmark:update',
  BOOKMARK_MOVE = 'bookmark:move',
  BOOKMARK_GET_TREE = 'bookmark:get-tree',
  BOOKMARK_GET_CHILDREN = 'bookmark:get-children',
  BOOKMARK_IS_BOOKMARKED = 'bookmark:is-bookmarked',
  BOOKMARK_SEARCH = 'bookmark:search',

  // Downloads
  DOWNLOAD_GET_ALL = 'download:get-all',
  DOWNLOAD_PAUSE = 'download:pause',
  DOWNLOAD_RESUME = 'download:resume',
  DOWNLOAD_CANCEL = 'download:cancel',

  // Settings
  SETTINGS_GET = 'settings:get',
  SETTINGS_SET = 'settings:set',
  SETTINGS_GET_ALL = 'settings:get-all',

  // Find in page
  FIND_START = 'find:start',
  FIND_NEXT = 'find:next',
  FIND_PREVIOUS = 'find:previous',
  FIND_STOP = 'find:stop',

  // Reading mode & dark mode
  READING_MODE_TOGGLE = 'reading:toggle',
  DARK_MODE_TOGGLE = 'dark:toggle',
  DARK_MODE_STATUS = 'dark:status',

  // Extensions
  EXTENSION_GET_ALL = 'extension:get-all',
  EXTENSION_TOGGLE = 'extension:toggle',
  EXTENSION_REMOVE = 'extension:remove',
  EXTENSION_LOAD = 'extension:load',

  // Workspace management
  WORKSPACE_CREATE = 'workspace:create',
  WORKSPACE_SWITCH = 'workspace:switch',
  WORKSPACE_DELETE = 'workspace:delete',
}

/**
 * IPC message payload wrapper
 * 
 * Type-safe message passing with discriminated unions
 * Enables exhaustive switch case checking at compile time
 */
export interface IPCMessage<T = unknown> {
  readonly channel: IPCChannel;
  readonly payload?: T;
  readonly requestId?: string; // For request-response pattern
}

/**
 * Application lifecycle states
 * 
 * State machine for application initialization and shutdown
 */
export enum AppLifecycleState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  WINDOW_CREATED = 'window_created',
  SHUTTING_DOWN = 'shutting_down',
  TERMINATED = 'terminated',
}

/**
 * Application configuration
 * 
 * Single source of truth for app-wide settings
 * Loaded from environment and config files on startup
 */
export interface AppConfig {
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
  readonly appName: string;
  readonly appVersion: string;
  readonly userDataPath: string;
  readonly logsPath: string;
  readonly vaultPath: string;
}

/**
 * Lifecycle event handler contract
 * 
 * Allows subsystems to hook into application lifecycle
 * Example: Vault system flushes encrypted data on quit
 */
export interface ILifecycleHandler {
  onReady?(): Promise<void>;
  onWindowCreated?(window: BrowserWindow): Promise<void>;
  onBeforeQuit?(): Promise<void>;
  onQuit?(): void;
}

/**
 * Logger interface
 * 
 * Abstraction enables testing and flexible logging backends
 * (console, file, remote telemetry, etc.)
 */
export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Tab state tracked by TabManager
 */
export interface TabState {
  readonly id: string;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isActive: boolean;
  createdAt: number;
}

/**
 * Tab creation options
 */
export interface TabCreateOptions {
  url?: string;
  active?: boolean;
}

/**
 * Tab operation result
 */
export interface TabResult<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
}

/**
 * Tab update event payload sent to renderer
 */
export interface TabUpdateEvent {
  tabs: TabState[];
  activeTabId: string | null;
}

/**
 * Security configuration
 *
 * Content Security Policy and other security headers
 */
export interface SecurityConfig {
  readonly contentSecurityPolicy: string;
  readonly enableRemoteModule: boolean;
  readonly allowedOrigins: readonly string[];
}
