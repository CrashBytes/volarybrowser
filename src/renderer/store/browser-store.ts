/**
 * Browser Store - Centralized state management via Zustand
 *
 * Replaces raw useState hooks in App.tsx with a single store
 * that manages tabs, vault status, downloads, and find-in-page state.
 *
 * @module renderer/store/browser-store
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TabState {
  id: string;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isActive: boolean;
  createdAt: number;
}

interface VaultStatus {
  isUnlocked: boolean;
  hasVault: boolean;
  isLoading: boolean;
  skipped?: boolean;
}

interface DownloadState {
  id: string;
  filename: string;
  url: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
}

interface FindState {
  isOpen: boolean;
  text: string;
  matches: number;
  activeMatch: number;
}

interface BrowserState {
  // Platform
  platform: NodeJS.Platform;

  // Tabs
  tabs: TabState[];
  activeTabId: string | null;

  // Vault
  vault: VaultStatus;

  // Downloads
  downloads: DownloadState[];

  // Find in page
  find: FindState;

  // Privacy
  blockedCount: number;
  blockedUrls: string[];
  showBlockedPanel: boolean;

  // Actions
  setPlatform: (platform: NodeJS.Platform) => void;
  setTabs: (tabs: TabState[], activeTabId: string | null) => void;
  setVaultStatus: (status: Partial<VaultStatus>) => void;
  setDownloads: (downloads: DownloadState[]) => void;
  setBlockedData: (count: number, urls: string[]) => void;
  toggleBlockedPanel: () => void;
  openFind: () => void;
  closeFind: () => void;
  setFindText: (text: string) => void;
  setFindResult: (matches: number, activeMatch: number) => void;
}

export const useBrowserStore = create<BrowserState>()(
  immer((set) => ({
    platform: 'darwin',
    tabs: [],
    activeTabId: null,
    vault: { isUnlocked: false, hasVault: false, isLoading: true },
    downloads: [],
    find: { isOpen: false, text: '', matches: 0, activeMatch: 0 },
    blockedCount: 0,
    blockedUrls: [],
    showBlockedPanel: false,

    setPlatform: (platform) => set((s) => { s.platform = platform; }),

    setTabs: (tabs, activeTabId) => set((s) => {
      s.tabs = tabs;
      s.activeTabId = activeTabId;
    }),

    setVaultStatus: (status) => set((s) => {
      Object.assign(s.vault, status);
    }),

    setDownloads: (downloads) => set((s) => { s.downloads = downloads; }),
    setBlockedData: (count, urls) => set((s) => {
      s.blockedCount = count;
      s.blockedUrls = urls;
    }),
    toggleBlockedPanel: () => set((s) => { s.showBlockedPanel = !s.showBlockedPanel; }),

    openFind: () => set((s) => { s.find.isOpen = true; }),
    closeFind: () => set((s) => {
      s.find.isOpen = false;
      s.find.text = '';
      s.find.matches = 0;
      s.find.activeMatch = 0;
    }),
    setFindText: (text) => set((s) => { s.find.text = text; }),
    setFindResult: (matches, activeMatch) => set((s) => {
      s.find.matches = matches;
      s.find.activeMatch = activeMatch;
    }),
  }))
);
