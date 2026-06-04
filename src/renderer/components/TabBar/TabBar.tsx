import React, { useState } from 'react';
import { CloseIcon, PlusIcon, SpeakerIcon, SpeakerMutedIcon } from '../../assets/icons/NavIcons';
import './TabBar.css';

interface TabBarProps {
  tabs: TabState[];
  activeTabId: string | null;
  onTabSwitch: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onContextMenuChange?: (open: boolean) => void;
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
  onContextMenuChange,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(tabId);
    }
  };

  const handleTabDragStart = (e: React.DragEvent, tabId: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
    setDraggingTabId(tabId);
  };

  const handleTabDragOver = (e: React.DragEvent, targetIndex: number) => {
    if (draggingTabId === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const before = e.clientX < midpoint;
    setDropIndex(before ? targetIndex : targetIndex + 1);
  };

  const handleTabDrop = (e: React.DragEvent) => {
    if (draggingTabId === null || dropIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    const fromIndex = tabs.findIndex((t) => t.id === draggingTabId);
    // When dropping after the original position, removing the dragged item
    // shifts all later positions down by one, so subtract 1 to land in the
    // slot the user actually pointed at.
    const targetIndex = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
    if (fromIndex !== -1 && targetIndex !== fromIndex) {
      window.volary.tabs.reorder(draggingTabId, targetIndex);
    }
    setDraggingTabId(null);
    setDropIndex(null);
  };

  const handleTabDragEnd = () => {
    setDraggingTabId(null);
    setDropIndex(null);
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string, tabIndex: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId, tabIndex });
    onContextMenuChange?.(true);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    onContextMenuChange?.(false);
  };

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
      <div
        className="tab-list"
        onDrop={handleTabDrop}
        onDragOver={(e) => {
          if (draggingTabId === null) return;
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setDropIndex(tabs.length);
          }
        }}
      >
        {tabs.map((tab, index) => {
          const isDragging = draggingTabId === tab.id;
          const showDropBefore = dropIndex === index && draggingTabId !== null && draggingTabId !== tab.id;
          const showDropAfter =
            dropIndex === index + 1 &&
            draggingTabId !== null &&
            draggingTabId !== tab.id &&
            (index === tabs.length - 1 || tabs[index + 1]?.id !== draggingTabId);
          return (
          <div
            key={tab.id}
            className={`tab-item${tab.id === activeTabId ? ' tab-item--active' : ''}${tab.isLoading ? ' tab-item--loading' : ''}${tab.isPinned ? ' tab-item--pinned' : ''}${isDragging ? ' tab-item--dragging' : ''}${showDropBefore ? ' tab-item--drop-before' : ''}${showDropAfter ? ' tab-item--drop-after' : ''}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            draggable
            onDragStart={(e) => handleTabDragStart(e, tab.id)}
            onDragOver={(e) => handleTabDragOver(e, index)}
            onDrop={handleTabDrop}
            onDragEnd={handleTabDragEnd}
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
            {!tab.isPinned && <span className="tab-title">{tab.title || 'New Tab'}</span>}
            {!tab.isPinned && tab.isLoading && <span className="tab-spinner" />}
            {!tab.isPinned && (tab.isAudioPlaying || tab.isMuted) && (
              <button
                className="tab-audio"
                onClick={(e) => {
                  e.stopPropagation();
                  window.volary.tabs.toggleMute(tab.id);
                }}
                title={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
                aria-label={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
              >
                {tab.isMuted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
              </button>
            )}
            {!tab.isPinned && (
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
            )}
          </div>
          );
        })}
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
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 240),
              top: contextMenu.y + 4,
            }}
          >
            <button className="tab-context-item" onClick={() => {
              window.volary.tabs.togglePin(contextMenu.tabId);
              closeContextMenu();
            }}>
              {tabs.find(t => t.id === contextMenu.tabId)?.isPinned ? 'Unpin Tab' : 'Pin Tab'}
            </button>
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
