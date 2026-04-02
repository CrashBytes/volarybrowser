import React, { useState } from 'react';
import { CloseIcon, PlusIcon } from '../../assets/icons/NavIcons';
import './TabBar.css';

interface TabBarProps {
  tabs: TabState[];
  activeTabId: string | null;
  onTabSwitch: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

interface ContextMenu {
  x: number;
  y: number;
  tabId: string;
  tabIndex: number;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabSwitch,
  onTabClose,
  onNewTab,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(tabId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string, tabIndex: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId, tabIndex });
  };

  const closeContextMenu = () => setContextMenu(null);

  const closeTab = (tabId: string) => {
    onTabClose(tabId);
    closeContextMenu();
  };

  const closeTabsToRight = () => {
    if (!contextMenu) return;
    const toClose = tabs.slice(contextMenu.tabIndex + 1);
    for (const tab of toClose) {
      onTabClose(tab.id);
    }
    closeContextMenu();
  };

  const closeTabsToLeft = () => {
    if (!contextMenu) return;
    const toClose = tabs.slice(0, contextMenu.tabIndex);
    for (const tab of toClose) {
      onTabClose(tab.id);
    }
    closeContextMenu();
  };

  const closeOtherTabs = () => {
    if (!contextMenu) return;
    for (const tab of tabs) {
      if (tab.id !== contextMenu.tabId) {
        onTabClose(tab.id);
      }
    }
    closeContextMenu();
  };

  const duplicateTab = () => {
    if (!contextMenu) return;
    const tab = tabs.find(t => t.id === contextMenu.tabId);
    if (tab?.url) {
      window.volary.tabs.create(tab.url);
    }
    closeContextMenu();
  };

  const hasTabsToRight = contextMenu ? contextMenu.tabIndex < tabs.length - 1 : false;
  const hasTabsToLeft = contextMenu ? contextMenu.tabIndex > 0 : false;
  const hasOtherTabs = tabs.length > 1;

  return (
    <div className="tab-bar" role="tablist" onClick={closeContextMenu}>
      <div className="tab-list">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`tab-item${tab.id === activeTabId ? ' tab-item--active' : ''}${tab.isLoading ? ' tab-item--loading' : ''}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => onTabSwitch(tab.id)}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id, index)}
            title={tab.url || tab.title}
          >
            {tab.favicon ? (
              <img
                className="tab-favicon"
                src={tab.favicon}
                alt=""
                width="16"
                height="16"
                draggable={false}
              />
            ) : (
              <span className="tab-favicon-placeholder" />
            )}
            <span className="tab-title">{tab.title || 'New Tab'}</span>
            {tab.isLoading && <span className="tab-spinner" />}
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              aria-label={`Close ${tab.title || 'tab'}`}
              title="Close tab"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
      <button
        className="tab-new"
        onClick={onNewTab}
        aria-label="New tab"
        title="New tab (Ctrl+T)"
      >
        <PlusIcon />
      </button>

      {contextMenu && (
        <>
          <div className="tab-context-overlay" onClick={closeContextMenu} />
          <div
            className="tab-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button className="tab-context-item" onClick={duplicateTab}>
              Duplicate Tab
            </button>
            <div className="tab-context-separator" />
            <button className="tab-context-item" onClick={() => closeTab(contextMenu.tabId)}>
              Close Tab
            </button>
            <button className="tab-context-item" onClick={closeTabsToRight} disabled={!hasTabsToRight}>
              Close Tabs to the Right
            </button>
            <button className="tab-context-item" onClick={closeTabsToLeft} disabled={!hasTabsToLeft}>
              Close Tabs to the Left
            </button>
            <button className="tab-context-item" onClick={closeOtherTabs} disabled={!hasOtherTabs}>
              Close Other Tabs
            </button>
          </div>
        </>
      )}
    </div>
  );
};
