import React from 'react';
import { CloseIcon, PlusIcon } from '../../assets/icons/NavIcons';
import './TabBar.css';

interface TabBarProps {
  tabs: TabState[];
  activeTabId: string | null;
  onTabSwitch: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabSwitch,
  onTabClose,
  onNewTab,
}) => {
  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    // Middle-click to close tab
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(tabId);
    }
  };

  return (
    <div className="tab-bar" role="tablist">
      <div className="tab-list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item${tab.id === activeTabId ? ' tab-item--active' : ''}${tab.isLoading ? ' tab-item--loading' : ''}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => onTabSwitch(tab.id)}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
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
    </div>
  );
};
