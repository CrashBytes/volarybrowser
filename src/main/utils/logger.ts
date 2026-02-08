/**
 * Structured logging utility
 * 
 * Logging Philosophy:
 * - Structured logging enables machine parsing and analysis
 * - Context-enriched logs facilitate debugging in production
 * - Log levels enable filtering without code changes
 * - Abstraction allows backend swapping (console -> file -> remote)
 * 
 * Future Enhancement: Replace with winston or pino for production
 * 
 * @module utils/logger
 */

import { ILogger } from '../types';

/**
 * Log level enumeration
 * 
 * Ordered by severity (DEBUG < INFO < WARN < ERROR)
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log entry structure
 * 
 * Consistent format enables log aggregation and analysis
 */
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    name: string;
  };
}

/**
 * Console-based logger implementation
 * 
 * Simple implementation for development/alpha phase
 * Production: Replace with persistent logging (winston, pino)
 */
class ConsoleLogger implements ILogger {
  private minLevel: LogLevel;
  private namespace: string;

  constructor(namespace: string = 'Volary', minLevel: LogLevel = LogLevel.DEBUG) {
    this.namespace = namespace;
    this.minLevel = minLevel;
  }

  /**
   * Format log entry for output
   * 
   * Human-readable in development, JSON in production
   */
  private format(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = entry.level.padEnd(5);
    const namespace = this.namespace.padEnd(10);
    const message = entry.message;

    let formatted = `[${timestamp}] ${level} [${namespace}] ${message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      formatted += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }

    if (entry.error) {
      formatted += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        formatted += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return formatted;
  }

  /**
   * Get ISO timestamp
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Check if log level should be emitted
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  /**
   * Log debug message
   * 
   * Use for: Detailed execution traces, variable inspection
   * Disabled in production by default
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'DEBUG',
      message,
      context,
    };

    console.debug(this.format(entry));
  }

  /**
   * Log informational message
   * 
   * Use for: Normal operation events, milestones
   */
  public info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'INFO',
      message,
      context,
    };

    console.info(this.format(entry));
  }

  /**
   * Log warning message
   * 
   * Use for: Unexpected but handled conditions, deprecations
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'WARN',
      message,
      context,
    };

    console.warn(this.format(entry));
  }

  /**
   * Log error message
   * 
   * Use for: Exceptions, failures requiring attention
   * Always includes stack trace for debugging
   */
  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'ERROR',
      message,
      context,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : undefined,
    };

    console.error(this.format(entry));
  }

  /**
   * Create child logger with extended namespace
   * 
   * Enables hierarchical logging:
   * - Main process: [Volary:Main]
   * - Window manager: [Volary:Main:Window]
   */
  public child(childNamespace: string): ConsoleLogger {
    return new ConsoleLogger(`${this.namespace}:${childNamespace}`, this.minLevel);
  }
}

/**
 * Logger factory
 * 
 * Creates logger instances with appropriate configuration
 */
export class LoggerFactory {
  private static defaultLevel: LogLevel = LogLevel.INFO;

  /**
   * Set minimum log level for all new loggers
   */
  public static setDefaultLevel(level: LogLevel): void {
    LoggerFactory.defaultLevel = level;
  }

  /**
   * Create logger instance
   * 
   * @param namespace - Logger identifier (typically module name)
   * @param level - Minimum log level (optional, uses default)
   */
  public static create(namespace: string, level?: LogLevel): ILogger {
    return new ConsoleLogger(namespace, level ?? LoggerFactory.defaultLevel);
  }
}

/**
 * Export factory as default
 * 
 * Usage:
 * ```typescript
 * import { LoggerFactory } from './utils/logger';
 * const logger = LoggerFactory.create('WindowManager');
 * logger.info('Window created', { width: 1280, height: 800 });
 * ```
 */
export { ConsoleLogger };

/**
 * Development helper: Set debug level in dev mode
 */
if (process.env.NODE_ENV === 'development') {
  LoggerFactory.setDefaultLevel(LogLevel.DEBUG);
}
