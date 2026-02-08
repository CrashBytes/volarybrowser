/**
 * Application configuration management
 * 
 * Configuration-as-Data Philosophy:
 * - All runtime behavior controlled by configuration
 * - No magic constants scattered through codebase
 * - Environment-specific overrides (dev/prod)
 * - Immutable after initialization (prevents runtime corruption)
 * 
 * @module config
 */

import { app } from 'electron';
import * as path from 'path';
import { AppConfig, WindowConfig, SecurityConfig } from './types';

/**
 * Determine execution environment
 * 
 * Priority order:
 * 1. NODE_ENV environment variable
 * 2. Electron packaged state detection
 * 3. Default to production (fail-safe)
 */
const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
};

/**
 * Application-wide configuration
 * 
 * Singleton pattern ensures consistent configuration across modules
 * Lazy initialization ensures Electron app is ready before path resolution
 */
class Configuration {
  private static instance: Configuration;
  private _appConfig: AppConfig | null = null;

  private constructor() {}

  /**
   * Singleton accessor
   */
  public static getInstance(): Configuration {
    if (!Configuration.instance) {
      Configuration.instance = new Configuration();
    }
    return Configuration.instance;
  }

  /**
   * Initialize configuration
   * 
   * MUST be called after Electron's 'ready' event
   * Resolves user data paths and validates environment
   */
  public initialize(): void {
    if (this._appConfig) {
      throw new Error('Configuration already initialized');
    }

    const userDataPath = app.getPath('userData');
    const logsPath = path.join(userDataPath, 'logs');
    const vaultPath = path.join(userDataPath, 'vault');

    this._appConfig = {
      isDevelopment: isDevelopment(),
      isProduction: !isDevelopment(),
      appName: app.getName(),
      appVersion: app.getVersion(),
      userDataPath,
      logsPath,
      vaultPath,
    };

    // Ensure critical directories exist
    // (Actual directory creation handled by storage module)
  }

  /**
   * Get application configuration
   * 
   * @throws Error if accessed before initialization
   */
  public get app(): AppConfig {
    if (!this._appConfig) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this._appConfig;
  }

  /**
   * Get window configuration
   * 
   * Security-first defaults:
   * - Context isolation enabled
   * - Node integration disabled
   * - Sandbox enabled
   * - Web security enforced
   */
  public get window(): WindowConfig {
    return {
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      frame: !isDevelopment(), // Frameless in production for custom chrome
      transparent: false,
      backgroundColor: '#1a1a1a', // Dark mode default
      title: 'Volary Browser',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, // CRITICAL: Isolate renderer from Node.js
        nodeIntegration: false, // CRITICAL: Disable Node.js in renderer
        sandbox: true, // CRITICAL: OS-level process isolation
        webSecurity: true, // Enforce same-origin policy
        allowRunningInsecureContent: false, // Block mixed content
      },
    };
  }

  /**
   * Get security configuration
   * 
   * Content Security Policy enforces strict security boundaries
   * Prevents XSS, injection attacks, and unauthorized resource loading
   */
  public get security(): SecurityConfig {
    return {
      // Strict CSP: Only allow resources from same origin
      // In production, this should be even more restrictive
      contentSecurityPolicy: isDevelopment()
        ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
      
      enableRemoteModule: false, // DEPRECATED: Remote module is security vulnerability
      
      // Allowed origins for IPC communication (renderer -> main)
      // In production, restrict to specific origins
      allowedOrigins: isDevelopment()
        ? ['http://localhost:3000', 'http://localhost:8080']
        : [],
    };
  }

  /**
   * Get development-specific configuration
   * 
   * Hot reload settings, debug tools, verbose logging
   */
  public get devServer(): { port: number; host: string } {
    return {
      port: 3000,
      host: 'localhost',
    };
  }
}

/**
 * Export singleton instance
 * 
 * Usage:
 * ```typescript
 * import { config } from './config';
 * const appConfig = config.app;
 * ```
 */
export const config = Configuration.getInstance();

/**
 * Utility: Check if running in development mode
 * 
 * Convenience function for conditional behavior
 */
export const isDevMode = (): boolean => {
  return isDevelopment();
};

/**
 * Utility: Get preload script path
 * 
 * Resolves preload script location for webview injection
 */
export const getPreloadPath = (): string => {
  return path.join(__dirname, '../preload/preload.js');
};
