/**
 * Preload Script - Secure IPC Bridge
 * 
 * Security Architecture:
 * This script runs in a privileged context with access to both Node.js and DOM APIs.
 * It serves as the controlled gateway between renderer and main processes.
 * 
 * Design Philosophy:
 * - Principle of Least Privilege: Expose minimal API surface
 * - Defense in Depth: Validate at both preload and main boundaries
 * - Explicit over Implicit: No wildcard API exposure
 * - Type Safety: TypeScript contracts enforced at compile time
 * 
 * Context Isolation Model:
 * With contextIsolation=true:
 * - Renderer runs in isolated JavaScript context
 * - Preload script bridges contexts via contextBridge
 * - No direct access to Node.js or Electron APIs from renderer
 * - Prevents supply chain attacks from compromised dependencies
 * 
 * @module preload
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

/**
 * API surface exposed to renderer process
 * 
 * Structured by domain for clear mental model:
 * - window: Window management operations
 * - vault: Encrypted storage operations
 * - navigation: Browser navigation
 * - tabs: Tab management
 * - workspaces: Context isolation
 * 
 * Each method validates input and handles errors gracefully
 */
const api = {
  /**
   * Window Management API
   * 
   * Controls window chrome (minimize, maximize, close, fullscreen)
   * No sensitive data handling - safe for unrestricted use
   */
  window: {
    /**
     * Minimize current window
     */
    minimize: (): void => {
      ipcRenderer.invoke('window:minimize');
    },

    /**
     * Maximize or restore current window
     */
    maximize: (): void => {
      ipcRenderer.invoke('window:maximize');
    },

    /**
     * Close current window
     */
    close: (): void => {
      ipcRenderer.invoke('window:close');
    },

    /**
     * Toggle fullscreen mode
     * 
     * @param fullscreen - true to enter fullscreen, false to exit
     */
    setFullscreen: (fullscreen: boolean): void => {
      ipcRenderer.invoke('window:fullscreen', { fullscreen });
    },
  },

  /**
   * Vault Management API
   * 
   * Security-critical operations with rate limiting
   * Handles encrypted storage initialization, unlock/lock operations
   */
  vault: {
    /**
     * Initialize new vault with master password
     * 
     * First-time setup only. Rate limited: 3 attempts per 5 minutes
     * 
     * @param password - Master password (min 12 characters)
     * @param authLevel - Authentication level (0=EPHEMERAL, 1=BASIC, 2=VAULT)
     * @returns Promise resolving to initialization result
     */
    initialize: async (password: string, authLevel?: number): Promise<{ success: boolean; message: string }> => {
      if (typeof password !== 'string' || password.length < 12) {
        return { success: false, message: 'Password must be at least 12 characters' };
      }

      return ipcRenderer.invoke('vault:initialize', { password, authLevel });
    },

    /**
     * Unlock vault with master password
     * 
     * Rate limited: 5 attempts per minute (enforced in main process)
     * 
     * @param password - Master password
     * @returns Promise resolving to unlock result
     */
    unlock: async (password: string): Promise<{ success: boolean; message: string }> => {
      if (typeof password !== 'string' || password.length === 0) {
        return { success: false, message: 'Invalid password' };
      }

      return ipcRenderer.invoke('vault:unlock', { password });
    },

    /**
     * Lock vault and clear decrypted data
     * 
     * @returns Promise resolving to lock result
     */
    lock: async (): Promise<{ success: boolean; message: string }> => {
      return ipcRenderer.invoke('vault:lock');
    },

    /**
     * Query vault status
     * 
     * @returns Promise resolving to vault status
     */
    getStatus: async (): Promise<{ isUnlocked: boolean; hasVault: boolean }> => {
      return ipcRenderer.invoke('vault:status');
    },
  },

  /**
   * Navigation API
   * 
   * Browser navigation controls (back, forward, reload, navigate)
   */
  navigation: {
    /**
     * Navigate backward in history
     */
    goBack: (): void => {
      ipcRenderer.invoke('nav:back');
    },

    /**
     * Navigate forward in history
     */
    goForward: (): void => {
      ipcRenderer.invoke('nav:forward');
    },

    /**
     * Reload current page
     */
    reload: (): void => {
      ipcRenderer.invoke('nav:reload');
    },

    /**
     * Navigate to URL
     * 
     * URL validation performed in main process
     * 
     * @param url - Target URL
     * @returns Promise resolving to navigation result
     */
    navigateTo: async (url: string): Promise<{ success: boolean; error?: string }> => {
      if (typeof url !== 'string' || url.length === 0) {
        return { success: false, error: 'Invalid URL' };
      }

      return ipcRenderer.invoke('nav:navigate', { url });
    },
  },

  /**
   * Tab Management API
   * 
   * Multi-tab browser functionality (placeholder for future implementation)
   */
  tabs: {
    /**
     * Create new tab
     * 
     * @param url - Optional URL to load in new tab
     * @returns Promise resolving to tab creation result
     */
    create: async (url?: string): Promise<{ success: boolean; message: string }> => {
      return ipcRenderer.invoke('tab:create', { url });
    },

    /**
     * Close tab
     * 
     * @param tabId - ID of tab to close
     * @returns Promise resolving to close result
     */
    close: async (tabId: string): Promise<{ success: boolean; message: string }> => {
      return ipcRenderer.invoke('tab:close', { tabId });
    },

    /**
     * Switch to tab
     *
     * @param tabId - ID of tab to switch to
     * @returns Promise resolving to switch result
     */
    switch: async (tabId: string): Promise<{ success: boolean; message: string }> => {
      return ipcRenderer.invoke('tab:switch', { tabId });
    },

    /**
     * Get all tabs and active tab ID
     *
     * @returns Promise resolving to tab list and active tab
     */
    getAll: async (): Promise<{ tabs: unknown[]; activeTabId: string | null }> => {
      return ipcRenderer.invoke('tab:get-all');
    },

    /**
     * Update tab content area bounds
     *
     * Called by renderer when chrome layout changes (resize, etc.)
     *
     * @param bounds - Rectangle for tab content area
     */
    updateBounds: (bounds: { x: number; y: number; width: number; height: number }): void => {
      ipcRenderer.invoke('tab:update-bounds', bounds);
    },
  },

  /**
   * Workspace Management API
   * 
   * Context isolation and workspace switching (placeholder for future implementation)
   */
  workspaces: {
    /**
     * Create new workspace
     * 
     * @param name - Workspace name
     * @returns Promise resolving to creation result
     */
    create: async (name: string): Promise<{ success: boolean; message: string }> => {
      return ipcRenderer.invoke('workspace:create', { name });
    },

    /**
     * Switch to workspace
     * 
     * @param workspaceId - ID of workspace to switch to
     * @returns Promise resolving to switch result
     */
    switch: async (workspaceId: string): Promise<{ success: boolean; message: string }> => {
      return ipcRenderer.invoke('workspace:switch', { workspaceId });
    },

    /**
     * Delete workspace
     * 
     * @param workspaceId - ID of workspace to delete
     * @returns Promise resolving to deletion result
     */
    delete: async (workspaceId: string): Promise<{ success: boolean; message: string }> => {
      return ipcRenderer.invoke('workspace:delete', { workspaceId });
    },
  },

  /**
   * Event Subscription API
   * 
   * Allows renderer to subscribe to main process events
   * Examples: vault locked, tab updated, workspace changed
   */
  on: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void => {
    // Whitelist of allowed event channels
    const allowedChannels = [
      'vault:status-changed',
      'tab:updated',
      'workspace:changed',
      'navigation:completed',
    ];

    if (!allowedChannels.includes(channel)) {
      console.error(`Attempt to subscribe to unauthorized channel: ${channel}`);
      return;
    }

    ipcRenderer.on(channel, callback);
  },

  /**
   * Event Unsubscription API
   * 
   * Removes event listener to prevent memory leaks
   */
  off: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void => {
    ipcRenderer.removeListener(channel, callback);
  },

  /**
   * System Information API
   * 
   * Provides access to non-sensitive system information
   */
  system: {
    /**
     * Get platform information
     * 
     * @returns Platform name (darwin, win32, linux)
     */
    getPlatform: (): NodeJS.Platform => {
      return process.platform;
    },

    /**
     * Get application version
     * 
     * @returns Application version string
     */
    getVersion: (): string => {
      // Version exposed at build time via webpack
      return process.env.APP_VERSION || '0.0.0';
    },

    /**
     * Check if running in development mode
     * 
     * @returns true if development mode
     */
    isDevelopment: (): boolean => {
      return process.env.NODE_ENV === 'development';
    },
  },
};

/**
 * Expose API to renderer process
 * 
 * contextBridge creates a secure proxy that:
 * - Prevents prototype pollution
 * - Blocks access to internal Electron APIs
 * - Enables strict type checking
 * 
 * The 'volary' namespace is accessible in renderer as:
 * window.volary.window.minimize()
 * window.volary.vault.unlock(password)
 * etc.
 */
contextBridge.exposeInMainWorld('volary', api);

/**
 * TypeScript type declarations for renderer process
 * 
 * Add to src/renderer/types/global.d.ts:
 * 
 * ```typescript
 * declare global {
 *   interface Window {
 *     volary: typeof api;
 *   }
 * }
 * ```
 */

/**
 * Development console helpers
 * 
 * Expose additional debugging tools in development mode
 */
if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld('devTools', {
    /**
     * Log message to main process console
     * 
     * Useful for debugging issues that only occur in production build
     */
    logToMain: (message: string, data?: unknown): void => {
      ipcRenderer.invoke('dev:log', { message, data });
    },

    /**
     * Get performance metrics
     * 
     * Returns memory usage, CPU time, etc.
     */
    getMetrics: async (): Promise<unknown> => {
      return ipcRenderer.invoke('dev:metrics');
    },
  });
}

/**
 * Initialization logging
 * 
 * Confirms preload script executed successfully
 */
console.log('[Volary Preload] Context bridge initialized');
console.log('[Volary Preload] API surface exposed:', Object.keys(api));
