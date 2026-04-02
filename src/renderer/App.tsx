/**
 * Volary Browser - Root Application Component
 *
 * Orchestrates browser chrome: window controls, tab bar, address bar, status bar.
 * Web content is rendered by BrowserView in the main process, positioned beneath
 * the chrome. This component manages tab state and reports chrome layout bounds
 * so the main process can position the active tab's view correctly.
 *
 * @module renderer/App
 */

import React, { useEffect, useRef, useCallback } from 'react';
import './App.css';
import { TabBar } from './components/TabBar';
import { AddressBar } from './components/AddressBar';
import { VaultInitialize } from './components/VaultInitialize';
import { VaultUnlock } from './components/VaultUnlock';
import { FindBar } from './components/FindBar';
import { DownloadBar } from './components/DownloadBar';
import { useBrowserStore } from './store/browser-store';

export const App: React.FC = () => {
  const {
    platform,
    tabs,
    activeTabId,
    vault: vaultStatus,
    setPlatform,
    setTabs,
    setVaultStatus,
    setDownloads,
    setBlockedData,
    blockedCount,
    blockedUrls,
    showBlockedPanel,
    toggleBlockedPanel,
    openFind,
  } = useBrowserStore();

  const [isMaximized, setIsMaximized] = React.useState(false);

  // Layout refs for bounds calculation
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  // Derive active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  // Whether a modal or panel overlay is blocking the content area
  const isModalOpen = (!vaultStatus.isLoading && !vaultStatus.skipped &&
    (!vaultStatus.hasVault || !vaultStatus.isUnlocked)) || showBlockedPanel;

  /**
   * Report chrome bounds to main process
   * When a modal is open, hide the BrowserView so it doesn't steal clicks
   */
  const reportBounds = useCallback(() => {
    if (!window.volary) return;

    if (isModalOpen) {
      // Hide the BrowserView by giving it zero size
      window.volary.tabs.updateBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }

    const headerHeight = headerRef.current?.offsetHeight || 0;
    const footerHeight = footerRef.current?.offsetHeight || 0;
    const width = window.innerWidth;
    const height = window.innerHeight;

    window.volary.tabs.updateBounds({
      x: 0,
      y: headerHeight,
      width,
      height: Math.max(0, height - headerHeight - footerHeight),
    });
  }, [isModalOpen]);

  /**
   * Initialization
   */
  useEffect(() => {
    if (!window.volary) {
      console.error('[App] window.volary API not available!');
      return;
    }

    setPlatform(window.volary.system.getPlatform());
    checkVaultStatus();
    fetchTabs();

    // Subscribe to events
    const handleVaultChange = (_event: unknown, status: { isUnlocked: boolean; hasVault: boolean }) => {
      setVaultStatus({ isUnlocked: status.isUnlocked, hasVault: status.hasVault, isLoading: false });
    };
    const handleTabUpdate = (_event: unknown, data: { tabs: typeof tabs; activeTabId: string | null }) => {
      setTabs(data.tabs, data.activeTabId);
    };
    const handleDownloadUpdate = (_event: unknown, downloads: unknown[]) => {
      setDownloads(downloads as any);
    };
    const handleBlockedCount = (_event: unknown, data: { count: number; urls: string[] }) => {
      setBlockedData(data.count, data.urls);
    };

    window.volary.on('vault:status-changed', handleVaultChange);
    window.volary.on('tab:updated', handleTabUpdate);
    window.volary.on('download:updated', handleDownloadUpdate);
    window.volary.on('privacy:blocked-count', handleBlockedCount);

    return () => {
      window.volary.off('vault:status-changed', handleVaultChange);
      window.volary.off('tab:updated', handleTabUpdate);
      window.volary.off('download:updated', handleDownloadUpdate);
      window.volary.off('privacy:blocked-count', handleBlockedCount);
    };
  }, []);

  /**
   * Bounds reporting on mount, resize, and layout changes
   */
  useEffect(() => {
    reportBounds();
    window.addEventListener('resize', reportBounds);

    const observer = new ResizeObserver(reportBounds);
    if (headerRef.current) observer.observe(headerRef.current);
    if (footerRef.current) observer.observe(footerRef.current);

    return () => {
      window.removeEventListener('resize', reportBounds);
      observer.disconnect();
    };
  }, [reportBounds]);

  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs (works on all platforms)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1 && activeTabId) {
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const next = e.shiftKey
            ? (idx - 1 + tabs.length) % tabs.length
            : (idx + 1) % tabs.length;
          window.volary.tabs.switch(tabs[next].id);
        }
        return;
      }

      if (mod && e.key === 't') {
        e.preventDefault();
        window.volary.tabs.create().then(() => {
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>('.address-bar__input');
            input?.focus();
            input?.select();
          }, 50);
        });
      } else if (mod && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) window.volary.tabs.close(activeTabId);
      } else if (mod && e.key === 'l') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.address-bar__input')?.focus();
      } else if (mod && e.key === 'f') {
        e.preventDefault();
        openFind();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, openFind]);

  // -- Data fetching --

  const fetchTabs = async () => {
    try {
      const result = await window.volary.tabs.getAll();
      setTabs(result.tabs as typeof tabs, result.activeTabId);
    } catch (error) {
      console.error('[App] Failed to fetch tabs:', error);
    }
  };

  const checkVaultStatus = async () => {
    try {
      const status = await window.volary.vault.getStatus();
      setVaultStatus({ isUnlocked: status.isUnlocked, hasVault: status.hasVault, isLoading: false });
    } catch (error) {
      console.error('[App] Failed to check vault status:', error);
      setVaultStatus({ isUnlocked: false, hasVault: false, isLoading: false });
    }
  };

  // -- Window controls --

  const handleMinimize = () => window.volary.window.minimize();
  const handleMaximize = () => {
    window.volary.window.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.volary.window.close();

  /**
   * Window Chrome - platform-specific controls
   */
  const WindowChrome: React.FC = () => {
    const isMac = platform === 'darwin';
    if (isMac) {
      // macOS: native traffic lights provided by titleBarStyle:'hiddenInset'
      // Just add a drag region with left padding to avoid overlapping them
      return <div className="window-chrome mac-drag-region" />;
    }
    return (
      <div className="window-chrome win">
        <div className="window-controls">
          <button className="window-control minimize" onClick={handleMinimize} title="Minimize" aria-label="Minimize window">&minus;</button>
          <button className="window-control maximize" onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'} aria-label={isMaximized ? 'Restore window' : 'Maximize window'}>{isMaximized ? '\u274F' : '\u25A1'}</button>
          <button className="window-control close" onClick={handleClose} title="Close" aria-label="Close window">&times;</button>
        </div>
      </div>
    );
  };

  /**
   * Status Bar
   */
  const StatusBar: React.FC = () => (
    <div className="status-bar">
      <div className="status-indicator">
        <span className={`status-dot ${vaultStatus.isLoading ? 'vault-loading' : vaultStatus.isUnlocked ? 'vault-unlocked' : 'vault-locked'}`} />
        <span className="status-text">
          Vault: {vaultStatus.isLoading ? 'Loading...' : vaultStatus.isUnlocked ? 'Unlocked' : 'Locked'}
        </span>
      </div>
      {blockedCount > 0 && (
        <div className="status-indicator status-clickable" onClick={toggleBlockedPanel}>
          <span className="status-text">{blockedCount} blocked</span>
        </div>
      )}
      {activeTab && (
        <div className="status-indicator">
          <span className="status-text">{activeTab.url || 'New Tab'}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
      <header className="app-header" ref={headerRef}>
        <WindowChrome />
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSwitch={(id) => window.volary.tabs.switch(id)}
          onTabClose={(id) => window.volary.tabs.close(id)}
          onNewTab={() => {
            window.volary.tabs.create().then(() => {
              setTimeout(() => {
                const input = document.querySelector<HTMLInputElement>('.address-bar__input');
                input?.focus();
                input?.select();
              }, 50);
            });
          }}
        />
        <AddressBar
          url={activeTab?.url || ''}
          isLoading={activeTab?.isLoading || false}
          canGoBack={activeTab?.canGoBack || false}
          canGoForward={activeTab?.canGoForward || false}
          onNavigate={(url) => window.volary.navigation.navigateTo(url)}
          onGoBack={() => window.volary.navigation.goBack()}
          onGoForward={() => window.volary.navigation.goForward()}
          onReload={() => window.volary.navigation.reload()}
          onStop={() => window.volary.navigation.reload()}
        />
        <FindBar />
      </header>

      <main className="app-content">
        {/* Web content is rendered by BrowserView in main process */}
        {tabs.length === 0 && (
          <div className="welcome-screen">
            <div className="welcome-content">
              <h1 className="welcome-title">Volary Browser</h1>
              <p className="welcome-subtitle">Security-first, context-aware web browser</p>
              <p className="welcome-hint">Press Ctrl+T to open a new tab</p>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer" ref={footerRef}>
        {showBlockedPanel && blockedUrls.length > 0 && (
          <div className="blocked-panel">
            <div className="blocked-panel__header">
              <strong>{blockedCount} requests blocked</strong>
              <button className="blocked-panel__close" onClick={toggleBlockedPanel}>&times;</button>
            </div>
            <ul className="blocked-panel__list">
              {[...new Set(blockedUrls)].map((domain, i) => {
                const count = blockedUrls.filter(u => u === domain).length;
                return (
                  <li key={i} className="blocked-panel__item">
                    <span className="blocked-panel__domain">{domain}</span>
                    <span className="blocked-panel__count">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <DownloadBar />
        <StatusBar />
      </footer>

      {/* Vault Modals */}
      {!vaultStatus.isLoading && !vaultStatus.skipped && (
        <>
          {!vaultStatus.hasVault && (
            <VaultInitialize
              onSuccess={() => setVaultStatus({ isUnlocked: true, hasVault: true, isLoading: false })}
              onSkip={() => setVaultStatus({ skipped: true })}
            />
          )}
          {vaultStatus.hasVault && !vaultStatus.isUnlocked && (
            <VaultUnlock
              onSuccess={() => setVaultStatus({ isUnlocked: true })}
              onCancel={() => setVaultStatus({ skipped: true })}
              allowSkip={true}
            />
          )}
        </>
      )}
    </div>
  );
};
