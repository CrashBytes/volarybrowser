/**
 * Context Menu
 *
 * Right-click context menus for web content rendered in tabs.
 *
 * @module context-menu
 */

import { Menu, MenuItem, BrowserView, clipboard, dialog, net } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { TabManager } from './tab-manager';
import { LoggerFactory } from './utils/logger';
import { isTranslatableUrl } from './translation/language';
import { MediaVault, MediaKind, VaultLockedError, guessMedia } from './security/media-vault';

const logger = LoggerFactory.create('ContextMenu');

let mediaVault: MediaVault | null = null;
let requestVaultUnlock: (() => void) | null = null;

/**
 * Wire the encrypted media store used by "Save ... to Vault", plus a callback
 * that asks the UI to show the unlock prompt when the vault is locked.
 */
export function setMediaVault(vault: MediaVault, onLocked: () => void): void {
  mediaVault = vault;
  requestVaultUnlock = onLocked;
}

type SaveOutcome = { ok: true; name: string } | { ok: false; locked: boolean; message: string };

/**
 * Download a URL and store it encrypted in the vault. Plaintext never touches disk.
 */
async function saveMediaToVault(url: string, type: MediaKind): Promise<SaveOutcome> {
  if (!mediaVault) {
    return { ok: false, locked: false, message: 'Vault is not available' };
  }
  if (!mediaVault.isUnlocked()) {
    return { ok: false, locked: true, message: 'Unlock the vault to save media' };
  }
  try {
    const urlObj = new URL(url);
    let filename = decodeURIComponent(path.basename(urlObj.pathname)) || `${type}-${Date.now()}`;

    const response = await net.fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());

    const headerMime = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    const guessed = guessMedia(filename);
    const mime = headerMime && headerMime !== 'application/octet-stream' ? headerMime : guessed.mime;
    if (!path.extname(filename)) {
      const ext = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov').replace('svg+xml', 'svg');
      filename += ext ? `.${ext}` : '';
    }

    const entry = await mediaVault.save({ name: filename, type, mime, bytes, sourceUrl: url });
    logger.info(`${type} saved to vault`, { id: entry.id, size: entry.size });
    return { ok: true, name: entry.name };
  } catch (error) {
    if (error instanceof VaultLockedError) {
      return { ok: false, locked: true, message: 'Unlock the vault to save media' };
    }
    logger.error(`Failed to save ${type} to vault`, error as Error, { url });
    return { ok: false, locked: false, message: (error as Error).message };
  }
}

async function reportSave(outcome: SaveOutcome, label: string): Promise<void> {
  if (outcome.ok) {
    await dialog.showMessageBox({
      type: 'info',
      title: `${label} Saved`,
      message: `${label} encrypted and saved to vault`,
      detail: outcome.name,
    });
    return;
  }
  if (outcome.locked) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Vault Locked',
      message: 'Unlock the vault to save media',
      detail: 'Saved media is encrypted with your vault password. Unlock the vault, then save again.',
      buttons: ['Unlock Vault', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) requestVaultUnlock?.();
    return;
  }
  await dialog.showMessageBox({
    type: 'error',
    title: 'Save Failed',
    message: `Failed to save ${label.toLowerCase()} to vault`,
    detail: outcome.message,
  });
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
          await reportSave(await saveMediaToVault(params.srcURL, 'image'), 'Image');
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
          const kind: MediaKind = params.mediaType === 'video' ? 'video' : 'audio';
          await reportSave(await saveMediaToVault(params.srcURL, kind), kind === 'video' ? 'Video' : 'Audio');
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

    // Translation (the context menu always comes from the visible, active tab)
    const translation = tabManager.getTranslationManager();
    if (translation && isTranslatableUrl(view.webContents.getURL())) {
      const state = translation.getState();
      if (state && (state.status === 'translated' || state.status === 'translating')) {
        menu.append(new MenuItem({
          label: 'Show Original Page',
          click: () => { translation.restoreTab().catch(() => {}); },
        }));
      } else {
        const target = state?.targetName ?? 'English';
        menu.append(new MenuItem({
          label: `Translate Page to ${target}`,
          click: () => { translation.translateTab().catch(() => {}); },
        }));
      }
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
