/**
 * Application Menu
 *
 * Native menu bar for macOS/Windows/Linux.
 * Provides discoverability for all browser features with keyboard accelerators.
 *
 * @module app-menu
 */

import { Menu, app, BrowserWindow, shell, dialog } from 'electron';
import { TabManager } from './tab-manager';
import { saveSession, listSessions, getSession } from '../../core/storage/repositories/sessions';
import { ILogger } from './types';
import { LoggerFactory } from './utils/logger';

export class AppMenu {
  private logger: ILogger;
  private tabManager: TabManager;

  constructor(tabManager: TabManager) {
    this.logger = LoggerFactory.create('AppMenu');
    this.tabManager = tabManager;
  }

  build(mainWindow: BrowserWindow): void {
    const isMac = process.platform === 'darwin';
    const send = (channel: string, ...args: unknown[]) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
      }
    };

    const template: Electron.MenuItemConstructorOptions[] = [
      // App menu (macOS only)
      ...(isMac ? [{
        label: app.getName(),
        submenu: [
          { role: 'about' as const },
          { type: 'separator' as const },
          {
            label: 'Settings...',
            accelerator: 'Cmd+,',
            click: () => send('open-settings'),
          },
          { type: 'separator' as const },
          { role: 'hide' as const },
          { role: 'hideOthers' as const },
          { role: 'unhide' as const },
          { type: 'separator' as const },
          { role: 'quit' as const },
        ],
      }] : []),

      // File
      {
        label: 'File',
        submenu: [
          {
            label: 'New Tab',
            accelerator: 'CmdOrCtrl+T',
            click: () => {
              this.tabManager.createTab({ active: true });
              send('focus-address-bar');
            },
          },
          {
            label: 'Close Tab',
            accelerator: 'CmdOrCtrl+W',
            click: () => {
              const activeId = this.tabManager.getActiveTabId();
              if (activeId) this.tabManager.closeTab(activeId);
            },
          },
          { type: 'separator' },
          {
            label: 'Save Session...',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: async () => {
              const result = await dialog.showInputBox?.(mainWindow, {
                title: 'Save Session',
                label: 'Session name:',
              }).catch(() => null);
              // dialog.showInputBox doesn't exist in Electron, use showMessageBox prompt
              const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'Save Session',
                message: 'Save all open tabs as a session?',
                detail: 'You can restore them later from File > Restore Session.',
                buttons: ['Cancel', 'Save'],
                defaultId: 1,
              });
              if (response === 1) {
                const tabs = this.tabManager.getAllTabStates();
                const name = `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
                saveSession(name, tabs.map(t => ({ url: t.url, title: t.title })));
              }
            },
          },
          {
            label: 'Restore Session',
            submenu: (() => {
              try {
                const sessions = listSessions();
                if (sessions.length === 0) {
                  return [{ label: 'No saved sessions', enabled: false }];
                }
                return sessions.slice(0, 10).map((s: any) => ({
                  label: `${s.name} (${s.tab_count} tabs)`,
                  click: async () => {
                    const session = getSession(s.id);
                    if (session) {
                      for (const tab of session.tabs) {
                        await this.tabManager.createTab({ url: tab.url, active: false });
                      }
                    }
                  },
                }));
              } catch {
                return [{ label: 'No saved sessions', enabled: false }];
              }
            })(),
          },
          { type: 'separator' },
          {
            label: 'Print...',
            accelerator: 'CmdOrCtrl+P',
            click: () => {
              const tab = this.tabManager.getActiveTab();
              if (tab) tab.view.webContents.print();
            },
          },
          ...(!isMac ? [
            { type: 'separator' as const },
            {
              label: 'Settings',
              accelerator: 'Ctrl+,',
              click: () => send('open-settings'),
            },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ] : []),
        ],
      },

      // Edit
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Find...',
            accelerator: 'CmdOrCtrl+F',
            click: () => send('open-find'),
          },
        ],
      },

      // View
      {
        label: 'View',
        submenu: [
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => this.tabManager.reload(),
          },
          {
            label: 'Force Reload',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: () => {
              const tab = this.tabManager.getActiveTab();
              if (tab) tab.view.webContents.reloadIgnoringCache();
            },
          },
          { type: 'separator' },
          {
            label: 'Zoom In',
            accelerator: 'CmdOrCtrl+=',
            click: () => this.tabManager.zoomIn(),
          },
          {
            label: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            click: () => this.tabManager.zoomOut(),
          },
          {
            label: 'Actual Size',
            accelerator: 'CmdOrCtrl+0',
            click: () => this.tabManager.zoomReset(),
          },
          { type: 'separator' },
          {
            label: 'Reading Mode',
            accelerator: 'CmdOrCtrl+Shift+L',
            click: () => send('toggle-reading-mode'),
          },
          {
            label: 'Force Dark Mode',
            click: () => mainWindow.webContents.send('toggle-dark-mode'),
          },
          { type: 'separator' },
          {
            label: 'Toggle Developer Tools',
            accelerator: isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
            click: () => {
              const tab = this.tabManager.getActiveTab();
              if (tab) tab.view.webContents.toggleDevTools();
            },
          },
          { role: 'togglefullscreen' },
        ],
      },

      // Bookmarks
      {
        label: 'Bookmarks',
        submenu: [
          {
            label: 'Bookmark This Page',
            accelerator: 'CmdOrCtrl+D',
            click: () => send('toggle-bookmark'),
          },
          {
            label: 'Show Bookmarks Bar',
            type: 'checkbox',
            checked: true,
            click: (menuItem) => send('toggle-bookmarks-bar', menuItem.checked),
          },
        ],
      },

      // Tools
      {
        label: 'Tools',
        submenu: [
          {
            label: 'Colorblind Mode',
            submenu: [
              {
                label: 'Off',
                type: 'radio',
                click: () => send('set-colorblind', 'off'),
              },
              {
                label: 'Deuteranopia (red-green)',
                type: 'radio',
                click: () => send('set-colorblind', 'deuteranopia'),
              },
              {
                label: 'Protanopia (red-green)',
                type: 'radio',
                click: () => send('set-colorblind', 'protanopia'),
              },
              {
                label: 'Tritanopia (blue-yellow)',
                type: 'radio',
                click: () => send('set-colorblind', 'tritanopia'),
              },
            ],
          },
          { type: 'separator' },
          {
            label: 'Saved Media (Vault)',
            click: () => {
              const mediaDir = require('path').join(app.getPath('userData'), 'vault', 'media');
              shell.openPath(mediaDir);
            },
          },
          { type: 'separator' },
          {
            label: 'Clear Browsing Data...',
            click: () => send('open-settings', 'privacy'),
          },
        ],
      },

      // Window
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac ? [
            { type: 'separator' as const },
            { role: 'front' as const },
          ] : [
            { role: 'close' as const },
          ]),
        ],
      },

      // Help
      {
        label: 'Help',
        submenu: [
          {
            label: 'Keyboard Shortcuts',
            click: () => send('open-settings', 'shortcuts'),
          },
          { type: 'separator' },
          {
            label: 'About Volary Browser',
            click: () => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'About Volary Browser',
                message: 'Volary Browser',
                detail: `Version ${app.getVersion()}\n\nSecurity-first, privacy-focused web browser.\n\nBuilt with Electron, React, and TypeScript.`,
              });
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    this.logger.info('Application menu built');
  }
}
