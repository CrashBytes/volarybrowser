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
import { mediaSniffer } from './media/media-sniffer';
import { readMp4Info, matchesElement } from './media/mp4-info';

const logger = LoggerFactory.create('ContextMenu');

let mediaVault: MediaVault | null = null;
let requestVaultUnlock: (() => void) | null = null;
let showToast: ((message: string) => void) | null = null;

/**
 * Wire the encrypted media store used by "Save ... to Vault", plus callbacks
 * that ask the UI to show the unlock prompt when the vault is locked and a
 * self-dismissing toast when a save succeeds.
 */
export function setMediaVault(vault: MediaVault, onLocked: () => void, onToast: (message: string) => void): void {
  mediaVault = vault;
  requestVaultUnlock = onLocked;
  showToast = onToast;
}

type SaveOutcome = { ok: true; name: string } | { ok: false; locked: boolean; message: string };

/** A media element on the page, possibly found underneath an overlay. */
interface PageMedia {
  type: MediaKind;
  src: string;
  /** Element playback info, used to identify the file behind a blob: stream */
  duration: number;
  width: number;
  height: number;
}

interface Downloaded {
  bytes: Buffer;
  mime: string;
  filename: string;
  sourceUrl: string;
}

// Isolated world: the page can't see or tamper with the probe.
const PROBE_WORLD_ID = 1999;
const PROBE_TIMEOUT_MS = 400;
const STREAM_CANDIDATE_LIMIT = 12;

/**
 * Find the image/video/audio under the cursor even when the site covers it
 * with a transparent overlay (TikTok, Instagram), which hides it from
 * Chromium's own hit test.
 */
async function probeMediaAt(view: BrowserView, x: number, y: number): Promise<PageMedia | null> {
  const zoom = view.webContents.getZoomFactor() || 1;
  const code = `(() => {
    const x = ${Number(x) / zoom}, y = ${Number(y) / zoom};
    const describe = (el) => {
      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
        const src = el.currentSrc || el.src || (el.querySelector('source') || {}).src || '';
        return src ? { type: el instanceof HTMLVideoElement ? 'video' : 'audio', src,
          duration: el.duration, width: el.videoWidth || 0, height: el.videoHeight || 0 } : null;
      }
      if (el instanceof HTMLImageElement && (el.currentSrc || el.src)) {
        return { type: 'image', src: el.currentSrc || el.src, duration: 0, width: el.naturalWidth, height: el.naturalHeight };
      }
      return null;
    };
    for (const el of document.elementsFromPoint(x, y)) {
      const found = describe(el);
      if (found) return found;
    }
    // Elements with pointer-events: none are skipped by elementsFromPoint
    for (const el of document.querySelectorAll('video, audio, img')) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const found = describe(el);
        if (found) return found;
      }
    }
    return null;
  })()`;
  try {
    const result = await Promise.race([
      view.webContents.executeJavaScriptInIsolatedWorld(PROBE_WORLD_ID, [{ code }]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PROBE_TIMEOUT_MS)),
    ]);
    const media = result as PageMedia | null;
    if (!media || typeof media.src !== 'string' || !['image', 'video', 'audio'].includes(media.type)) return null;
    return media;
  } catch {
    return null;
  }
}

async function download(url: string, type: MediaKind): Promise<Downloaded> {
  let filename = decodeURIComponent(path.basename(new URL(url).pathname)) || `${type}-${Date.now()}`;

  const response = await net.fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  const headerMime = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const guessed = guessMedia(filename);
  const mime = headerMime && headerMime !== 'application/octet-stream' ? headerMime : guessed.mime;
  if (!path.extname(filename)) filename += extensionFor(mime);
  return { bytes, mime, filename, sourceUrl: url };
}

function extensionFor(mime: string): string {
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov').replace('svg+xml', 'svg');
  return ext ? `.${ext}` : '';
}

/**
 * Get the bytes for a media element. A blob: src is a MediaSource stream that
 * can't be fetched, so try the files this tab downloaded (newest first) and
 * take the one whose duration and frame size match the element.
 */
async function resolveMedia(media: PageMedia, view: BrowserView): Promise<Downloaded> {
  if (!media.src.startsWith('blob:')) return download(media.src, media.type);

  const prefix = media.type === 'audio' ? 'audio/' : 'video/';
  const candidates = mediaSniffer.recent(view.webContents.id)
    .filter((m) => m.mime.startsWith(prefix))
    .slice(0, STREAM_CANDIDATE_LIMIT);
  for (const candidate of candidates) {
    const file = await download(candidate.url, media.type).catch(() => null);
    const info = file && readMp4Info(file.bytes);
    if (file && info && matchesElement(info, media)) {
      // Stream URLs carry opaque ids; the page title makes a name worth grouping
      const title = view.webContents.getTitle().replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120);
      if (title) file.filename = `${title}${path.extname(file.filename) || extensionFor(file.mime)}`;
      return file;
    }
  }
  throw new Error('This video streams in pieces and the file behind it was not found. Let it play for a few seconds, then try again.');
}

/**
 * Download media and store it encrypted in the vault. Plaintext never touches disk.
 */
async function saveMediaToVault(media: PageMedia, view: BrowserView): Promise<SaveOutcome> {
  if (!mediaVault) {
    return { ok: false, locked: false, message: 'Vault is not available' };
  }
  if (!mediaVault.isUnlocked()) {
    return { ok: false, locked: true, message: 'Unlock the vault to save media' };
  }
  try {
    const file = await resolveMedia(media, view);
    const entry = await mediaVault.save({
      name: file.filename, type: media.type, mime: file.mime, bytes: file.bytes, sourceUrl: file.sourceUrl,
    });
    logger.info(`${media.type} saved to vault`, { id: entry.id, size: entry.size });
    return { ok: true, name: entry.name };
  } catch (error) {
    if (error instanceof VaultLockedError) {
      return { ok: false, locked: true, message: 'Unlock the vault to save media' };
    }
    logger.error(`Failed to save ${media.type} to vault`, error as Error, { url: media.src });
    return { ok: false, locked: false, message: (error as Error).message };
  }
}

async function reportSave(outcome: SaveOutcome, label: string): Promise<void> {
  if (outcome.ok) {
    showToast?.(`${label} saved to vault: ${outcome.name}`);
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
  view.webContents.on('context-menu', async (_event, params) => {
    const menu = new Menu();

    let image: PageMedia | null = params.hasImageContents
      ? { type: 'image', src: params.srcURL, duration: 0, width: 0, height: 0 }
      : null;
    let media: PageMedia | null = null;
    // Chromium only reports media it hit directly. Look under overlays, and
    // read playback info a blob: stream needs to find its file.
    if (!image) {
      const found = await probeMediaAt(view, params.x, params.y);
      if (found?.type === 'image') image = found;
      else if (found) media = found;
    }
    if (view.webContents.isDestroyed()) return;

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
    if (image) {
      const src = image.src;
      menu.append(new MenuItem({
        label: 'Open Image in New Tab',
        click: () => tabManager.createTab({ url: src, active: true }),
      }));
      menu.append(new MenuItem({
        label: 'Copy Image Address',
        click: () => clipboard.writeText(src),
      }));
      menu.append(new MenuItem({
        label: 'Save Image to Vault',
        click: async () => {
          await reportSave(await saveMediaToVault(image, view), 'Image');
        },
      }));
      menu.append(new MenuItem({
        label: 'Save Image As...',
        click: async () => {
          const ext = path.extname(new URL(src).pathname) || '.png';
          const result = await dialog.showSaveDialog({
            defaultPath: `image-${Date.now()}${ext}`,
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
          });
          if (!result.canceled && result.filePath) {
            try {
              const response = await fetch(src);
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
    if (media) {
      const found = media;
      const label = found.type === 'video' ? 'Video' : 'Audio';
      menu.append(new MenuItem({
        label: `Save ${label} to Vault`,
        click: async () => {
          await reportSave(await saveMediaToVault(found, view), label);
        },
      }));
      menu.append(new MenuItem({
        label: `Save ${label} As...`,
        click: async () => {
          try {
            const file = await resolveMedia(found, view);
            const result = await dialog.showSaveDialog({ defaultPath: file.filename });
            if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, file.bytes);
          } catch (error) {
            logger.error(`Failed to save ${found.type}`, error as Error);
            await dialog.showMessageBox({
              type: 'error', title: 'Save Failed', message: `Failed to save ${found.type}`, detail: (error as Error).message,
            });
          }
        },
      }));
      menu.append(new MenuItem({
        label: `Copy ${label} Address`,
        enabled: !found.src.startsWith('blob:'),
        click: () => clipboard.writeText(found.src),
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
