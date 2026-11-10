import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression: after the vault auto-locked, bringing the window back showed the
 * last page without asking for the password. Hiding the page was left to the
 * renderer, and resumeAllViews() put the page back on screen unconditionally.
 * The main process must keep tab content hidden while the session is locked.
 */

const { FakeBrowserView, FakeBrowserWindow } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('events');
  class FakeWebContents extends EventEmitter {
    loadURL = vi.fn(async (_url: string) => {});
    setWebRTCIPHandlingPolicy = vi.fn();
    setWindowOpenHandler = vi.fn();
    setBackgroundThrottling = vi.fn();
    setFrameRate = vi.fn();
    isDestroyed() { return false; }
  }
  class FakeBrowserView {
    webContents = new FakeWebContents();
    setBounds = vi.fn();
  }
  class FakeBrowserWindow extends EventEmitter {
    webContents = { send: vi.fn() };
    isDestroyed() { return false; }
    addBrowserView = vi.fn();
    removeBrowserView = vi.fn();
  }
  return { FakeBrowserView, FakeBrowserWindow };
});

vi.mock('electron', () => ({
  BrowserView: FakeBrowserView,
  BrowserWindow: class {},
  Menu: { buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })) },
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn() },
}));
vi.mock('../../../src/main/context-menu', () => ({ attachContextMenu: vi.fn() }));
vi.mock('../../../core/storage/repositories/settings', () => ({
  getSetting: (_key: string, fallback: unknown) => fallback,
}));

import { TabManager } from '../../../src/main/tab-manager';

const ZERO = { x: 0, y: 0, width: 0, height: 0 };
const PAGE = { x: 0, y: 90, width: 1000, height: 600 };

describe('TabManager content lock', () => {
  let tm: TabManager;
  let view: InstanceType<typeof FakeBrowserView>;
  const lastBounds = () => view.setBounds.mock.calls.at(-1)?.[0];

  beforeEach(async () => {
    tm = new TabManager();
    tm.setWindow(new FakeBrowserWindow() as any);
    await tm.createTab({ active: true });
    view = tm.getActiveTab()!.view as any;
    tm.updateBounds(PAGE);
    expect(lastBounds()).toEqual(PAGE);
  });

  it('hides the active page as soon as content is locked', () => {
    tm.setContentLocked(true);
    expect(lastBounds()).toEqual(ZERO);
  });

  it('keeps the page hidden when the screen unlocks or the system resumes', () => {
    tm.setContentLocked(true);
    tm.suspendAllViews();
    tm.resumeAllViews();
    expect(lastBounds()).toEqual(ZERO);
  });

  it('ignores renderer bounds reports while locked', () => {
    tm.setContentLocked(true);
    tm.updateBounds(PAGE);
    expect(lastBounds()).toEqual(ZERO);
  });

  it('keeps a tab switched to or created while locked hidden', async () => {
    tm.setContentLocked(true);
    await tm.createTab({ active: true });
    const second = tm.getActiveTab()!.view as any;
    expect(second.setBounds.mock.calls.at(-1)?.[0]).toEqual(ZERO);
  });

  it('shows the page again at the last reported bounds once unlocked', () => {
    tm.setContentLocked(true);
    tm.setContentLocked(false);
    expect(lastBounds()).toEqual(PAGE);
  });
});
