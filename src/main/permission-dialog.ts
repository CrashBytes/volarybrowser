/**
 * Permission Dialog
 *
 * Handles permission requests from web content (camera, mic, location, etc.)
 * Shows a native dialog and persists the user's decision per-site.
 *
 * @module permission-dialog
 */

import { session, dialog, BrowserWindow, WebContents } from 'electron';
import { getPermission, setPermission } from '../../core/storage/repositories/permissions';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

/** Human-readable labels for permission types */
const PERMISSION_LABELS: Record<string, string> = {
  'media': 'camera and microphone',
  'mediaKeySystem': 'protected content playback',
  'geolocation': 'your location',
  'notifications': 'send notifications',
  'midi': 'MIDI devices',
  'pointerLock': 'lock your pointer',
  'fullscreen': 'go fullscreen',
  'clipboard-read': 'read your clipboard',
  'clipboard-sanitized-write': 'write to your clipboard',
  'idle-detection': 'detect when you are idle',
  'display-capture': 'capture your screen',
};

/** Permissions that are always allowed without asking */
const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);

/** Permissions that are always denied */
const AUTO_DENY = new Set(['idle-detection']);

export class PermissionHandler {
  private logger: ILogger;

  constructor() {
    this.logger = LoggerFactory.create('PermissionHandler');
  }

  /**
   * Install permission handlers on the default session
   */
  initialize(): void {
    session.defaultSession.setPermissionRequestHandler(
      (webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
        this.handlePermissionRequest(webContents, permission, callback);
      }
    );

    // Permission check handler — Electron calls this to verify whether a
    // permission is currently granted before the request handler fires.
    // Without this, geolocation and other checks silently fail.
    session.defaultSession.setPermissionCheckHandler(
      (_webContents: WebContents | null, permission: string) => {
        if (AUTO_ALLOW.has(permission)) return true;
        if (AUTO_DENY.has(permission)) return false;

        // For geolocation: allow the check so the request handler can prompt
        if (permission === 'geolocation') return true;

        return true;
      }
    );

    this.logger.info('PermissionHandler initialized');
  }

  private handlePermissionRequest(
    webContents: WebContents,
    permission: string,
    callback: (granted: boolean) => void
  ): void {
    // Auto-allow safe permissions
    if (AUTO_ALLOW.has(permission)) {
      callback(true);
      return;
    }

    // Auto-deny dangerous permissions
    if (AUTO_DENY.has(permission)) {
      callback(false);
      return;
    }

    let origin: string;
    try {
      origin = new URL(webContents.getURL()).origin;
    } catch {
      callback(false);
      return;
    }

    // Check for a stored decision
    const stored = getPermission(origin, permission);
    if (stored !== null) {
      this.logger.debug('Using stored permission decision', { origin, permission, decision: stored });
      callback(stored === 'allow');
      return;
    }

    // Show dialog
    const label = PERMISSION_LABELS[permission] || permission;
    const parentWindow = BrowserWindow.fromWebContents(webContents);

    dialog.showMessageBox(parentWindow ?? (undefined as unknown as BrowserWindow), {
      type: 'question',
      title: 'Permission Request',
      message: `${origin} wants to access ${label}`,
      detail: 'This permission can be changed later in settings.',
      buttons: ['Deny', 'Allow', 'Always Deny', 'Always Allow'],
      defaultId: 0,
      cancelId: 0,
    }).then(({ response }) => {
      switch (response) {
        case 1: // Allow (one-time)
          callback(true);
          break;
        case 2: // Always Deny
          setPermission(origin, permission, 'deny');
          callback(false);
          break;
        case 3: // Always Allow
          setPermission(origin, permission, 'allow');
          callback(true);
          break;
        default: // Deny (one-time)
          callback(false);
      }

      this.logger.info('Permission decision', {
        origin, permission,
        decision: response === 1 || response === 3 ? 'allow' : 'deny',
        persisted: response >= 2,
      });
    }).catch(() => {
      callback(false);
    });
  }
}
