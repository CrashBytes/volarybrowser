import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression: on macOS the app keeps running after its last window closes.
 * Clicking the Dock icon creates a fresh BrowserWindow, but TabManager still
 * pointed at the destroyed window and still held tabs whose WebContents died
 * with it. Result: Cmd+T silently did nothing ("No window available") and the
 * address bar threw "Cannot read properties of undefined (reading 'loadURL')".
 */

const { FakeBrowserView, FakeBrowserWindow } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('events');
  class FakeWebContents extends EventEmitter {
    destroyed = false;
    loadURL = vi.fn(async (_url: string) => {});
    setWebRTCIPHandlingPolicy = vi.fn();
    setWindowOpenHandler = vi.fn();
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; }
  }

  class FakeBrowserView {
    private wc: FakeWebContents | undefined = new FakeWebContents();
    setBounds = vi.fn();
    /** Electron returns undefined here once the WebContents is gone. */
    get webContents(): any { return this.wc && !this.wc.destroyed ? this.wc : undefined; }
    /** Simulate the owning window being destroyed. */
    _kill() { this.wc?.destroy(); this.wc = undefined; }
  }

  class FakeBrowserWindow extends EventEmitter {
    destroyed = false;
    views: FakeBrowserView[] = [];
    webContents = { send: vi.fn() };
    isDestroyed() { return this.destroyed; }
    addBrowserView = vi.fn((v: FakeBrowserView) => { this.views.push(v); });
    removeBrowserView = vi.fn((v: FakeBrowserView) => { this.views = this.views.filter((x) => x !== v); });
    /** What Electron does when the user closes the window: child views die, then 'closed' fires. */
    close() {
      for (const v of this.views) v._kill();
      this.destroyed = true;
      this.emit('closed');
    }
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

describe('TabManager window lifecycle (macOS reactivate)', () => {
  let tm: TabManager;
  let win1: FakeBrowserWindow;

  beforeEach(async () => {
    tm = new TabManager();
    win1 = new FakeBrowserWindow();
    tm.setWindow(win1 as any);
    const created = await tm.createTab({ active: true });
    expect(created.success).toBe(true);
  });

  it('drops tabs whose WebContents died with the closed window', () => {
    expect(tm.getAllTabStates()).toHaveLength(1);
    win1.close();
    expect(tm.getAllTabStates()).toHaveLength(0);
    expect(tm.getActiveTab()).toBeUndefined();
  });

  it('navigate() after the window closed fails cleanly instead of throwing', async () => {
    win1.close();
    const result = await tm.navigate('google.com');
    expect(result.success).toBe(false);
    expect(result.message).toBe('No active tab');
  });

  it('works again once a new window is attached', async () => {
    win1.close();
    const win2 = new FakeBrowserWindow();
    tm.setWindow(win2 as any);

    const created = await tm.createTab({ active: true });
    expect(created.success).toBe(true);
    expect(win2.addBrowserView).toHaveBeenCalledTimes(1);

    const nav = await tm.navigate('google.com');
    expect(nav.success).toBe(true);
    const view = win2.views[0];
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://google.com');
  });

  it('ignores a stale closed event from a window it no longer owns', async () => {
    const win2 = new FakeBrowserWindow();
    tm.setWindow(win2 as any);
    await tm.createTab({ active: true });
    const before = tm.getAllTabStates().length;
    win1.close(); // old window closing must not wipe win2's tabs
    expect(tm.getAllTabStates()).toHaveLength(before);
  });
});
