/**
 * Context Menu
 *
 * Right-click context menus for web content rendered in tabs.
 *
 * @module context-menu
 */

import { Menu, MenuItem, BrowserView, clipboard, shell } from 'electron';
import { TabManager } from './tab-manager';

/**
 * Attach a context menu handler to a BrowserView's webContents
 */
export function attachContextMenu(view: BrowserView, tabManager: TabManager): void {
  view.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    // Link context
    if (params.linkURL) {
      menu.append(new MenuItem({
        label: 'Open Link in New Tab',
        click: () => tabManager.createTab({ url: params.linkURL, active: true }),
      }));
      menu.append(new MenuItem({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Image context
    if (params.hasImageContents) {
      menu.append(new MenuItem({
        label: 'Open Image in New Tab',
        click: () => tabManager.createTab({ url: params.srcURL, active: true }),
      }));
      menu.append(new MenuItem({
        label: 'Copy Image Address',
        click: () => clipboard.writeText(params.srcURL),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Selection context
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Copy',
        role: 'copy',
      }));
      menu.append(new MenuItem({
        label: `Search for "${params.selectionText.slice(0, 30)}${params.selectionText.length > 30 ? '...' : ''}"`,
        click: () => {
          const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(params.selectionText)}`;
          tabManager.createTab({ url: searchUrl, active: true });
        },
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Editable context
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
      menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Standard items
    menu.append(new MenuItem({
      label: 'Back',
      enabled: view.webContents.canGoBack(),
      click: () => view.webContents.goBack(),
    }));
    menu.append(new MenuItem({
      label: 'Forward',
      enabled: view.webContents.canGoForward(),
      click: () => view.webContents.goForward(),
    }));
    menu.append(new MenuItem({
      label: 'Reload',
      click: () => view.webContents.reload(),
    }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Inspect Element',
      click: () => view.webContents.inspectElement(params.x, params.y),
    }));

    menu.popup();
  });
}
