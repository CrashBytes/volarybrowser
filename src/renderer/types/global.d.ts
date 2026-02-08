/**
 * Global Type Definitions - Renderer Process
 * 
 * Declares types for APIs injected by preload script via contextBridge.
 * Provides compile-time type safety for window.volary API.
 * 
 * Architectural Pattern: Contract-First Design
 * - Renderer depends on contract, not implementation
 * - Main process implementation must satisfy contract
 * - Preload script enforces contract boundaries
 * 
 * @module renderer/types/global
 */

/**
 * Volary API exposed by preload script
 * 
 * Mirrors the API structure defined in src/preload/preload.ts
 * Any changes to preload API MUST be reflected here for type safety
 */
interface VolaryAPI {
  /**
   * Window Management API
   * 
   * Controls browser window chrome operations
   */
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    setFullscreen(fullscreen: boolean): void;
  };

  /**
   * Vault Management API
   * 
   * Encrypted storage operations with authentication
   */
  vault: {
    initialize(password: string, authLevel?: number): Promise<VaultInitializeResult>;
    unlock(password: string): Promise<VaultUnlockResult>;
    lock(): Promise<VaultLockResult>;
    getStatus(): Promise<VaultStatus>;
  };

  /**
   * Navigation API
   * 
   * Browser navigation controls
   */
  navigation: {
    goBack(): void;
    goForward(): void;
    reload(): void;
    navigateTo(url: string): Promise<NavigationResult>;
  };

  /**
   * Tab Management API
   *
   * Multi-tab browsing operations
   */
  tabs: {
    create(url?: string): Promise<TabOperationResult>;
    close(tabId: string): Promise<TabOperationResult>;
    switch(tabId: string): Promise<TabOperationResult>;
    getAll(): Promise<TabUpdateEvent>;
    updateBounds(bounds: { x: number; y: number; width: number; height: number }): void;
  };

  /**
   * Workspace Management API
   * 
   * Context isolation and workspace switching
   */
  workspaces: {
    create(name: string): Promise<WorkspaceOperationResult>;
    switch(workspaceId: string): Promise<WorkspaceOperationResult>;
    delete(workspaceId: string): Promise<WorkspaceOperationResult>;
  };

  /**
   * Event Subscription API
   * 
   * Subscribe to main process events
   */
  on(
    channel: string,
    callback: (event: unknown, ...args: unknown[]) => void
  ): void;

  /**
   * Event Unsubscription API
   * 
   * Remove event listeners to prevent memory leaks
   */
  off(
    channel: string,
    callback: (event: unknown, ...args: unknown[]) => void
  ): void;

  /**
   * System Information API
   * 
   * Access to non-sensitive system metadata
   */
  system: {
    getPlatform(): NodeJS.Platform;
    getVersion(): string;
    isDevelopment(): boolean;
  };
}

/**
 * Development Tools API (development mode only)
 * 
 * Additional debugging utilities exposed in development builds
 */
interface DevToolsAPI {
  logToMain(message: string, data?: unknown): void;
  getMetrics(): Promise<unknown>;
}

/**
 * Result Types - Standardized Response Shapes
 * 
 * Consistent error handling across all async operations
 * Success/failure discriminated unions enable exhaustive matching
 */
interface VaultInitializeResult {
  success: boolean;
  message: string;
}

interface VaultUnlockResult {
  success: boolean;
  message: string;
}

interface VaultLockResult {
  success: boolean;
  message: string;
}

interface VaultStatus {
  isUnlocked: boolean;
  hasVault: boolean;
}

interface NavigationResult {
  success: boolean;
  error?: string;
}

interface TabOperationResult {
  success: boolean;
  message: string;
  data?: { tabId?: string };
}

interface TabState {
  id: string;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isActive: boolean;
  createdAt: number;
}

interface TabUpdateEvent {
  tabs: TabState[];
  activeTabId: string | null;
}

interface WorkspaceOperationResult {
  success: boolean;
  message: string;
}

/**
 * Extend Window interface with Volary APIs
 * 
 * TypeScript module augmentation pattern
 * Merges with global Window type for type safety
 */
declare global {
  interface Window {
    /**
     * Volary Browser API
     * 
     * Injected by preload script via contextBridge
     * Available throughout renderer process
     */
    volary: VolaryAPI;

    /**
     * Development Tools API
     * 
     * Only available in development builds
     * Provides debugging and diagnostic utilities
     */
    devTools?: DevToolsAPI;

    /**
     * React DevTools hook detection
     * 
     * Used to verify React DevTools extension is installed
     */
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
  }
}

/**
 * Module augmentation requires export
 * 
 * Empty export transforms file into module
 * Enables TypeScript to merge declarations
 */
export {};
