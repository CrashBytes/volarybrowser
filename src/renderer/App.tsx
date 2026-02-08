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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { TabBar } from './components/TabBar';
import { AddressBar } from './components/AddressBar';
import { VaultInitialize } from './components/VaultInitialize';
import { VaultUnlock } from './components/VaultUnlock';

export const App: React.FC = () => {
  // Platform detection
  const [platform, setPlatform] = useState<NodeJS.Platform>('darwin');
  const [isMaximized, setIsMaximized] = useState(false);

  // Tab state
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Vault state
  const [vaultStatus, setVaultStatus] = useState<{
    isUnlocked: boolean;
    hasVault: boolean;
    isLoading: boolean;
  }>({ isUnlocked: false, hasVault: false, isLoading: true });

  // Layout refs for bounds calculation
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  // Derive active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  /**
   * Report chrome bounds to main process
   */
  const reportBounds = useCallback(() => {
    if (!window.volary) return;
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
  }, []);

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
    window.volary.on('vault:status-changed', handleVaultStatusChange);
    window.volary.on('tab:updated', handleTabUpdate);

    return () => {
      window.volary.off('vault:status-changed', handleVaultStatusChange);
      window.volary.off('tab:updated', handleTabUpdate);
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

      if (mod && e.key === 't') {
        e.preventDefault();
        window.volary.tabs.create();
      }

      if (mod && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) window.volary.tabs.close(activeTabId);
      }

      if (mod && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1 && activeTabId) {
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const next = e.shiftKey
            ? (idx - 1 + tabs.length) % tabs.length
            : (idx + 1) % tabs.length;
          window.volary.tabs.switch(tabs[next].id);
        }
      }

      if (mod && e.key === 'l') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.address-bar__input')?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId]);

  // -- Data fetching --

  const fetchTabs = async () => {
    try {
      const result = await window.volary.tabs.getAll();
      setTabs(result.tabs as TabState[]);
      setActiveTabId(result.activeTabId);
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

  // -- Event handlers --

  const handleVaultStatusChange = (_event: unknown, status: { isUnlocked: boolean; hasVault: boolean }) => {
    setVaultStatus({ isUnlocked: status.isUnlocked, hasVault: status.hasVault, isLoading: false });
  };

  const handleTabUpdate = (_event: unknown, data: TabUpdateEvent) => {
    setTabs(data.tabs);
    setActiveTabId(data.activeTabId);
  };

  const handleVaultInitialized = () => {
    setVaultStatus({ isUnlocked: true, hasVault: true, isLoading: false });
  };

  const handleVaultUnlocked = () => {
    setVaultStatus((prev) => ({ ...prev, isUnlocked: true }));
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
    return (
      <div className={`window-chrome ${isMac ? 'mac' : 'win'}`}>
        {isMac ? (
          <div className="traffic-lights">
            <button className="traffic-light close" onClick={handleClose} title="Close" aria-label="Close window" />
            <button className="traffic-light minimize" onClick={handleMinimize} title="Minimize" aria-label="Minimize window" />
            <button className="traffic-light maximize" onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'} aria-label={isMaximized ? 'Restore window' : 'Maximize window'} />
          </div>
        ) : (
          <div className="window-controls">
            <button className="window-control minimize" onClick={handleMinimize} title="Minimize" aria-label="Minimize window">&minus;</button>
            <button className="window-control maximize" onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'} aria-label={isMaximized ? 'Restore window' : 'Maximize window'}>{isMaximized ? '\u274F' : '\u25A1'}</button>
            <button className="window-control close" onClick={handleClose} title="Close" aria-label="Close window">&times;</button>
          </div>
        )}
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
          onNewTab={() => window.volary.tabs.create()}
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
        <StatusBar />
      </footer>

      {/* Vault Modals */}
      {!vaultStatus.isLoading && (
        <>
          {!vaultStatus.hasVault && <VaultInitialize onSuccess={handleVaultInitialized} />}
          {vaultStatus.hasVault && !vaultStatus.isUnlocked && (
            <VaultUnlock onSuccess={handleVaultUnlocked} allowSkip={false} />
          )}
        </>
      )}
    </div>
  );
};
