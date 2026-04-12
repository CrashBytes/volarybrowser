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
import { NewTabPage } from './components/NewTabPage';
import { BookmarkBar } from './components/BookmarkBar';
import { Settings } from './components/Settings';
import { AISidebar } from './components/AISidebar';
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
  const [tabContextMenuOpen, setTabContextMenuOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSection, setSettingsSection] = React.useState<string | undefined>();
  const [aiSidebarOpen, setAiSidebarOpen] = React.useState(false);
  const [highContrast, setHighContrast] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [screenReaderMode, setScreenReaderMode] = React.useState(false);

  // Layout refs for bounds calculation
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  // Derive active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  // Whether the BrowserView should be hidden (modal, panel, or new tab page)
  const vaultModalVisible = !vaultStatus.skipped &&
    (vaultStatus.isLoading || !vaultStatus.hasVault || !vaultStatus.isUnlocked);
  const isModalOpen = vaultModalVisible
    || showBlockedPanel
    || tabContextMenuOpen
    || settingsOpen
    || (activeTab != null && !activeTab.url);

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
    const totalWidth = window.innerWidth;
    const sidebarWidth = aiSidebarOpen ? 420 : 0;
    const contentWidth = totalWidth - sidebarWidth;
    const height = window.innerHeight;

    window.volary.tabs.updateBounds({
      x: 0,
      y: headerHeight,
      width: contentWidth,
      height: Math.max(0, height - headerHeight - footerHeight),
    });
  }, [isModalOpen, aiSidebarOpen]);

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
    loadAccessibilitySettings();

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

    const handleFocusAddressBar = () => {
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('.address-bar__input');
        input?.focus();
        input?.select();
      }, 50);
    };
    const handleOpenFind = () => openFind();
    const handleToggleReading = () => window.volary.readingMode.toggle();
    const handleToggleBookmark = () => {
      window.dispatchEvent(new CustomEvent('volary:toggle-bookmark'));
    };
    const handleOpenSettings = (_event: unknown, section?: string) => {
      setSettingsSection(typeof section === 'string' ? section : undefined);
      setSettingsOpen(true);
    };
    const handleOpenSettingsDOM = () => {
      setSettingsSection(undefined);
      setSettingsOpen(true);
    };
    window.addEventListener('volary:open-settings', handleOpenSettingsDOM);

    window.volary.on('vault:status-changed', handleVaultChange);
    window.volary.on('tab:updated', handleTabUpdate);
    window.volary.on('download:updated', handleDownloadUpdate);
    window.volary.on('privacy:blocked-count', handleBlockedCount);
    window.volary.on('focus-address-bar', handleFocusAddressBar);
    window.volary.on('open-find', handleOpenFind);
    window.volary.on('open-settings', handleOpenSettings);
    window.volary.on('toggle-reading-mode', handleToggleReading);
    window.volary.on('toggle-bookmark', handleToggleBookmark);

    return () => {
      window.volary.off('vault:status-changed', handleVaultChange);
      window.volary.off('tab:updated', handleTabUpdate);
      window.volary.off('download:updated', handleDownloadUpdate);
      window.volary.off('privacy:blocked-count', handleBlockedCount);
      window.volary.off('focus-address-bar', handleFocusAddressBar);
      window.volary.off('open-find', handleOpenFind);
      window.volary.off('open-settings', handleOpenSettings);
      window.volary.off('toggle-reading-mode', handleToggleReading);
      window.volary.off('toggle-bookmark', handleToggleBookmark);
      window.removeEventListener('volary:open-settings', handleOpenSettingsDOM);
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
      } else if (mod && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        window.volary.readingMode.toggle();
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        window.volary.zoom.in();
      } else if (mod && e.key === '-') {
        e.preventDefault();
        window.volary.zoom.out();
      } else if (mod && e.key === '0') {
        e.preventDefault();
        window.volary.zoom.reset();
      } else if (mod && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        setAiSidebarOpen(prev => !prev);
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

  const loadAccessibilitySettings = async () => {
    try {
      const all = await window.volary.settings.getAll();
      setHighContrast(!!all.highContrast);
      setReducedMotion(!!all.reducedMotion);
      setScreenReaderMode(!!all.screenReaderOptimized);
    } catch { /* use defaults */ }
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
      <div
        className={`status-indicator status-clickable${aiSidebarOpen ? ' status-active' : ''}`}
        onClick={() => setAiSidebarOpen(prev => !prev)}
        title="Toggle AI Sidebar (Cmd+Shift+A)"
      >
        <span className="status-text">AI</span>
      </div>
      {activeTab && (
        <div className="status-indicator">
          <span className="status-text">{activeTab.url || 'New Tab'}</span>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`app${highContrast ? ' app--high-contrast' : ''}${reducedMotion ? ' app--reduced-motion' : ''}${screenReaderMode ? ' app--screen-reader' : ''}`}
      role="application"
      aria-label="Volary Browser"
    >
      {/* Skip navigation link for keyboard/screen reader users */}
      <a href="#main-content" className="skip-nav" tabIndex={0}>
        Skip to content
      </a>

      <header className="app-header" ref={headerRef} role="banner">
        <WindowChrome />
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSwitch={(id) => window.volary.tabs.switch(id)}
          onTabClose={(id) => window.volary.tabs.close(id)}
          onContextMenuChange={setTabContextMenuOpen}
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
        <BookmarkBar />
      </header>

      <div className="app-body">
        <main className="app-content" id="main-content" role="main" aria-label="Web content">
          {/* Web content is rendered by BrowserView in main process */}
          {/* Show new tab page when the active tab has no URL */}
          {activeTab && !activeTab.url && <NewTabPage />}
        </main>

        <AISidebar
          isOpen={aiSidebarOpen}
          onClose={() => setAiSidebarOpen(false)}
        />
      </div>

      <footer className="app-footer" ref={footerRef} role="contentinfo" aria-label="Status bar">
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

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {activeTab ? `${activeTab.title || 'New Tab'} - ${activeTab.url || 'blank'}` : ''}
      </div>

      {/* Settings */}
      <Settings
        isOpen={settingsOpen}
        initialSection={settingsSection}
        onClose={() => {
          setSettingsOpen(false);
          loadAccessibilitySettings(); // Reload settings that affect the chrome
        }}
      />

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
