/**
 * Context Menu
 *
 * Right-click context menus for web content rendered in tabs.
 *
 * @module context-menu
 */

import { Menu, MenuItem, BrowserView, clipboard, shell, dialog, app, net } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { TabManager } from './tab-manager';
import { LoggerFactory } from './utils/logger';

const logger = LoggerFactory.create('ContextMenu');

/** Directory where vault media is saved */
function getVaultMediaDir(): string {
  return path.join(app.getPath('userData'), 'vault', 'media');
}

/**
 * Download a URL and save it to the vault media directory
 */
async function saveMediaToVault(url: string, type: 'image' | 'video'): Promise<string | null> {
  try {
    const mediaDir = getVaultMediaDir();
    await fs.mkdir(mediaDir, { recursive: true });

    // Extract filename from URL
    const urlObj = new URL(url);
    let filename = path.basename(urlObj.pathname) || `${type}-${Date.now()}`;

    // Ensure it has an extension
    if (!path.extname(filename)) {
      filename += type === 'image' ? '.png' : '.mp4';
    }

    // Make filename unique
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const saveName = `${base}-${timestamp}${ext}`;
    const savePath = path.join(mediaDir, saveName);

    // Download the file
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    await fs.writeFile(savePath, buffer);
    logger.info(`${type} saved to vault`, { savePath, size: buffer.length });

    return savePath;
  } catch (error) {
    logger.error(`Failed to save ${type} to vault`, error as Error, { url });
    return null;
  }
}

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
      menu.append(new MenuItem({
        label: 'Save Image to Vault',
        click: async () => {
          const saved = await saveMediaToVault(params.srcURL, 'image');
          if (saved) {
            dialog.showMessageBox({
              type: 'info',
              title: 'Image Saved',
              message: 'Image saved to vault',
              detail: path.basename(saved),
            });
          } else {
            dialog.showMessageBox({
              type: 'error',
              title: 'Save Failed',
              message: 'Failed to save image to vault',
            });
          }
        },
      }));
      menu.append(new MenuItem({
        label: 'Save Image As...',
        click: async () => {
          const ext = path.extname(new URL(params.srcURL).pathname) || '.png';
          const result = await dialog.showSaveDialog({
            defaultPath: `image-${Date.now()}${ext}`,
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
          });
          if (!result.canceled && result.filePath) {
            try {
              const response = await fetch(params.srcURL);
              const buffer = Buffer.from(await response.arrayBuffer());
              await fs.writeFile(result.filePath, buffer);
            } catch (error) {
              logger.error('Failed to save image', error as Error);
            }
          }
        },
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Video/media context
    if (params.mediaType === 'video' || params.mediaType === 'audio') {
      menu.append(new MenuItem({
        label: `Save ${params.mediaType === 'video' ? 'Video' : 'Audio'} to Vault`,
        click: async () => {
          const type = params.mediaType === 'video' ? 'video' : 'image';
          const saved = await saveMediaToVault(params.srcURL, type);
          if (saved) {
            dialog.showMessageBox({
              type: 'info',
              title: `${params.mediaType === 'video' ? 'Video' : 'Audio'} Saved`,
              message: `${params.mediaType === 'video' ? 'Video' : 'Audio'} saved to vault`,
              detail: path.basename(saved),
            });
          } else {
            dialog.showMessageBox({
              type: 'error',
              title: 'Save Failed',
              message: `Failed to save ${params.mediaType} to vault`,
            });
          }
        },
      }));
      menu.append(new MenuItem({
        label: `Save ${params.mediaType === 'video' ? 'Video' : 'Audio'} As...`,
        click: async () => {
          const ext = path.extname(new URL(params.srcURL).pathname) || (params.mediaType === 'video' ? '.mp4' : '.mp3');
          const result = await dialog.showSaveDialog({
            defaultPath: `${params.mediaType}-${Date.now()}${ext}`,
          });
          if (!result.canceled && result.filePath) {
            try {
              const response = await fetch(params.srcURL);
              const buffer = Buffer.from(await response.arrayBuffer());
              await fs.writeFile(result.filePath, buffer);
            } catch (error) {
              logger.error(`Failed to save ${params.mediaType}`, error as Error);
            }
          }
        },
      }));
      menu.append(new MenuItem({
        label: `Copy ${params.mediaType === 'video' ? 'Video' : 'Audio'} Address`,
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
