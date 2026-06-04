import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import './BookmarkBar.css';

interface Bookmark {
  id: number;
  title: string;
  url: string | null;
  isFolder: boolean;
  position?: number;
  children?: Bookmark[];
}

interface ContextMenuState {
  x: number;
  y: number;
  bookmark: Bookmark | null; // null = right-clicked on bar background
}

interface FolderDropdownState {
  bookmark: Bookmark;
  x: number;
  y: number;
}

type DropTarget =
  | { kind: 'folder'; id: number }
  | { kind: 'before'; parentId: number; position: number; siblingId: number }
  | { kind: 'end'; parentId: number };

interface BookmarkBarProps {
  onDialogChange?: (open: boolean) => void;
  onFolderDropdownHeight?: (height: number) => void;
}

export const BookmarkBar: React.FC<BookmarkBarProps> = ({ onDialogChange, onFolderDropdownHeight }) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [folderDropdown, setFolderDropdown] = useState<FolderDropdownState | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDialog, setEditDialog] = useState<Bookmark | null>(null);
  const [editDialogTitle, setEditDialogTitle] = useState('');
  const [editDialogUrl, setEditDialogUrl] = useState('');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBookmarks();
    const interval = setInterval(loadBookmarks, 5000);

    const handleBookmarkToggle = () => setTimeout(loadBookmarks, 200);
    window.volary.on('toggle-bookmark', handleBookmarkToggle);
    window.addEventListener('volary:bookmarks-changed', handleBookmarkToggle);

    return () => {
      clearInterval(interval);
      window.volary.off('toggle-bookmark', handleBookmarkToggle);
      window.removeEventListener('volary:bookmarks-changed', handleBookmarkToggle);
    };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Close folder dropdown on outside click
  useEffect(() => {
    if (!folderDropdown) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.bookmark-bar__folder-dropdown')) {
        setFolderDropdown(null);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [folderDropdown]);

  // Focus new folder input when shown
  useEffect(() => {
    if (showNewFolderInput && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [showNewFolderInput]);

  // Focus edit input when shown
  useEffect(() => {
    if (editingBookmark && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingBookmark]);

  // The centered edit dialog and the right-click context menu both need the
  // BrowserView hidden — the menu hangs below the bookmark bar into territory
  // covered by the BrowserView's native layer, which would otherwise occlude
  // the lower portion of the menu and cause it to look "missing" until the
  // user right-clicks again in a different spot.
  useEffect(() => {
    onDialogChange?.(editDialog !== null || contextMenu !== null);
  }, [editDialog, contextMenu, onDialogChange]);

  // The folder dropdown is anchored below the bookmark bar. Rather than hide
  // the BrowserView (which erases the page), report the dropdown's height so
  // App.tsx can push the BrowserView down by that amount — the dropdown then
  // renders in the gap and the page stays visible below it.
  useLayoutEffect(() => {
    if (!folderDropdown || !folderDropdownRef.current) {
      onFolderDropdownHeight?.(0);
      return;
    }
    const rect = folderDropdownRef.current.getBoundingClientRect();
    onFolderDropdownHeight?.(Math.ceil(rect.height));
    return () => onFolderDropdownHeight?.(0);
  }, [folderDropdown, onFolderDropdownHeight]);

  const loadBookmarks = async () => {
    try {
      const tree = await window.volary.bookmarks.getTree(1);
      if (tree?.children) {
        setBookmarks(tree.children);
      }
    } catch (err) {
      console.error('[BookmarkBar] Failed to load bookmarks:', err);
    }
  };

  const getFavicon = (url: string) => {
    try {
      return `${new URL(url).origin}/favicon.ico`;
    } catch {
      return '';
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, bookmark: Bookmark | null) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderDropdown(null);
    setContextMenu({ x: e.clientX, y: e.clientY, bookmark });
  }, []);

  const handleDelete = async (bookmark: Bookmark) => {
    setContextMenu(null);
    try {
      await window.volary.bookmarks.delete(bookmark.id);
      window.dispatchEvent(new CustomEvent('volary:bookmarks-changed'));
      loadBookmarks();
    } catch (err) {
      console.error('[BookmarkBar] Failed to delete bookmark:', err);
    }
  };

  const handleCreateFolder = () => {
    setContextMenu(null);
    setShowNewFolderInput(true);
    setNewFolderName('');
  };

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setShowNewFolderInput(false);
      return;
    }
    try {
      await window.volary.bookmarks.create(1, name, null, true);
      window.dispatchEvent(new CustomEvent('volary:bookmarks-changed'));
      loadBookmarks();
    } catch (err) {
      console.error('[BookmarkBar] Failed to create folder:', err);
    }
    setShowNewFolderInput(false);
    setNewFolderName('');
  };

  const handleRename = (bookmark: Bookmark) => {
    setContextMenu(null);
    setEditingBookmark(bookmark);
    setEditTitle(bookmark.title);
  };

  const handleEdit = (bookmark: Bookmark) => {
    setContextMenu(null);
    setEditDialog(bookmark);
    setEditDialogTitle(bookmark.title);
    setEditDialogUrl(bookmark.url ?? '');
  };

  const submitEditDialog = async () => {
    if (!editDialog) return;
    const title = editDialogTitle.trim();
    const url = editDialogUrl.trim();
    if (!title || !url) {
      setEditDialog(null);
      return;
    }
    try {
      await window.volary.bookmarks.update(
        editDialog.id,
        title !== editDialog.title ? title : undefined,
        url !== (editDialog.url ?? '') ? url : undefined,
      );
      window.dispatchEvent(new CustomEvent('volary:bookmarks-changed'));
      loadBookmarks();
    } catch (err) {
      console.error('[BookmarkBar] Failed to edit bookmark:', err);
    }
    setEditDialog(null);
  };

  const submitRename = async () => {
    if (!editingBookmark) return;
    const title = editTitle.trim();
    if (title && title !== editingBookmark.title) {
      try {
        await window.volary.bookmarks.update(editingBookmark.id, title);
        window.dispatchEvent(new CustomEvent('volary:bookmarks-changed'));
        loadBookmarks();
      } catch (err) {
        console.error('[BookmarkBar] Failed to rename bookmark:', err);
      }
    }
    setEditingBookmark(null);
    setEditTitle('');
  };

  // Check if `childId` is a descendant of `folderId` — prevents dropping a
  // folder into itself or one of its own descendants.
  const isDescendant = (folderId: number, childId: number): boolean => {
    if (folderId === childId) return true;
    const find = (list: Bookmark[]): Bookmark | null => {
      for (const bm of list) {
        if (bm.id === folderId) return bm;
        if (bm.children) {
          const found = find(bm.children);
          if (found) return found;
        }
      }
      return null;
    };
    const folder = find(bookmarks);
    if (!folder?.children) return false;
    const walk = (list: Bookmark[]): boolean => {
      for (const bm of list) {
        if (bm.id === childId) return true;
        if (bm.children && walk(bm.children)) return true;
      }
      return false;
    };
    return walk(folder.children);
  };

  const performDrop = async (sourceId: number, target: DropTarget) => {
    try {
      let newParentId: number;
      let newPosition: number;
      if (target.kind === 'folder') {
        if (isDescendant(sourceId, target.id)) return;
        newParentId = target.id;
        // Append to end of folder
        const find = (list: Bookmark[]): Bookmark | null => {
          for (const bm of list) {
            if (bm.id === target.id) return bm;
            if (bm.children) {
              const f = find(bm.children);
              if (f) return f;
            }
          }
          return null;
        };
        const folder = find(bookmarks);
        newPosition = folder?.children?.length ?? 0;
      } else if (target.kind === 'before') {
        if (isDescendant(sourceId, target.parentId)) return;
        newParentId = target.parentId;
        newPosition = target.position;
      } else {
        if (isDescendant(sourceId, target.parentId)) return;
        newParentId = target.parentId;
        const find = (list: Bookmark[]): Bookmark | null => {
          if (target.parentId === 1) return { children: list } as Bookmark;
          for (const bm of list) {
            if (bm.id === target.parentId) return bm;
            if (bm.children) {
              const f = find(bm.children);
              if (f) return f;
            }
          }
          return null;
        };
        const parent = find(bookmarks);
        newPosition = parent?.children?.length ?? 0;
      }
      await window.volary.bookmarks.move(sourceId, newParentId, newPosition);
      window.dispatchEvent(new CustomEvent('volary:bookmarks-changed'));
      loadBookmarks();
    } catch (err) {
      console.error('[BookmarkBar] Failed to move bookmark:', err);
    }
  };

  const handleDragStart = (e: React.DragEvent, bookmark: Bookmark) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(bookmark.id));
    setDraggingId(bookmark.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleItemDragOver = (e: React.DragEvent, bookmark: Bookmark) => {
    if (draggingId === null || draggingId === bookmark.id) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    if (bookmark.isFolder && offsetX > rect.width * 0.25 && offsetX < rect.width * 0.75) {
      setDropTarget({ kind: 'folder', id: bookmark.id });
    } else {
      // Drop before this sibling at its current position
      const parentId = findParentId(bookmark.id) ?? 1;
      const position = bookmark.position ?? 0;
      setDropTarget({ kind: 'before', parentId, position, siblingId: bookmark.id });
    }
  };

  const findParentId = (bookmarkId: number): number | null => {
    const walk = (list: Bookmark[], parentId: number): number | null => {
      for (const bm of list) {
        if (bm.id === bookmarkId) return parentId;
        if (bm.children) {
          const found = walk(bm.children, bm.id);
          if (found !== null) return found;
        }
      }
      return null;
    };
    return walk(bookmarks, 1);
  };

  const handleItemDrop = async (e: React.DragEvent, bookmark: Bookmark) => {
    if (draggingId === null) return;
    e.preventDefault();
    e.stopPropagation();
    const sourceId = draggingId;
    const target = dropTarget;
    setDraggingId(null);
    setDropTarget(null);
    if (!target || sourceId === bookmark.id) return;
    await performDrop(sourceId, target);
  };

  const handleBarDragOver = (e: React.DragEvent) => {
    if (draggingId === null) return;
    // Only handle drops on the bar background, not on items
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ kind: 'end', parentId: 1 });
  };

  const handleBarDrop = async (e: React.DragEvent) => {
    if (draggingId === null) return;
    e.preventDefault();
    const sourceId = draggingId;
    const target = dropTarget;
    setDraggingId(null);
    setDropTarget(null);
    if (!target) return;
    await performDrop(sourceId, target);
  };

  const handleFolderClick = (e: React.MouseEvent, bookmark: Bookmark) => {
    e.stopPropagation();
    if (folderDropdown?.bookmark.id === bookmark.id) {
      setFolderDropdown(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFolderDropdown({ bookmark, x: rect.left, y: rect.bottom + 2 });
  };

  const renderBookmarkItem = (bm: Bookmark, inDropdown = false) => {
    // If this item is being renamed inline
    if (editingBookmark?.id === bm.id) {
      return (
        <form
          key={bm.id}
          className="bookmark-bar__edit-form"
          onSubmit={(e) => { e.preventDefault(); submitRename(); }}
        >
          <input
            ref={editInputRef}
            className="bookmark-bar__edit-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => { if (e.key === 'Escape') { setEditingBookmark(null); } }}
          />
        </form>
      );
    }

    const isDropTargetFolder = dropTarget?.kind === 'folder' && dropTarget.id === bm.id;
    const isDropBefore = dropTarget?.kind === 'before' && dropTarget.siblingId === bm.id;
    const isDragging = draggingId === bm.id;
    const classes = [
      'bookmark-bar__item',
      inDropdown ? 'bookmark-bar__item--dropdown' : '',
      isDragging ? 'bookmark-bar__item--dragging' : '',
      isDropTargetFolder ? 'bookmark-bar__item--drop-folder' : '',
      isDropBefore ? 'bookmark-bar__item--drop-before' : '',
    ].filter(Boolean).join(' ');

    return (
      <button
        key={bm.id}
        className={classes}
        draggable
        onDragStart={(e) => handleDragStart(e, bm)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleItemDragOver(e, bm)}
        onDrop={(e) => handleItemDrop(e, bm)}
        onClick={(e) => {
          if (bm.isFolder) {
            handleFolderClick(e, bm);
          } else if (bm.url) {
            setFolderDropdown(null);
            window.volary.navigation.navigateTo(bm.url);
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, bm)}
        title={bm.url || bm.title}
      >
        {bm.isFolder ? (
          <span className="bookmark-bar__folder-icon">📁</span>
        ) : bm.url ? (
          <img
            className="bookmark-bar__favicon"
            src={getFavicon(bm.url)}
            alt=""
            width="14"
            height="14"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : null}
        <span className="bookmark-bar__title">
          {bm.title.length > 20 ? bm.title.slice(0, 18) + '...' : bm.title}
        </span>
      </button>
    );
  };

  return (
    <div
      className="bookmark-bar"
      onContextMenu={(e) => {
        // Only fire if right-click was directly on the bar (not on an item)
        if (e.target === e.currentTarget) {
          handleContextMenu(e, null);
        }
      }}
      onDragOver={handleBarDragOver}
      onDrop={handleBarDrop}
    >
      {bookmarks.length === 0 && !showNewFolderInput ? (
        <span
          className="bookmark-bar__empty"
          onContextMenu={(e) => handleContextMenu(e, null)}
        >
          Bookmarks will appear here
        </span>
      ) : (
        bookmarks.map((bm) => renderBookmarkItem(bm))
      )}

      {/* Inline new folder input */}
      {showNewFolderInput && (
        <form
          className="bookmark-bar__edit-form"
          onSubmit={(e) => { e.preventDefault(); submitNewFolder(); }}
        >
          <span className="bookmark-bar__folder-icon">📁</span>
          <input
            ref={newFolderInputRef}
            className="bookmark-bar__edit-input"
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={submitNewFolder}
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewFolderInput(false); } }}
          />
        </form>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="bookmark-bar__context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="bookmark-bar__context-item"
            onClick={handleCreateFolder}
          >
            New Folder
          </button>
          {contextMenu.bookmark && (
            <>
              {!contextMenu.bookmark.isFolder && (
                <button
                  className="bookmark-bar__context-item"
                  onClick={() => handleEdit(contextMenu.bookmark!)}
                >
                  Edit…
                </button>
              )}
              <button
                className="bookmark-bar__context-item"
                onClick={() => handleRename(contextMenu.bookmark!)}
              >
                Rename
              </button>
              <div className="bookmark-bar__context-divider" />
              <button
                className="bookmark-bar__context-item bookmark-bar__context-item--danger"
                onClick={() => handleDelete(contextMenu.bookmark!)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Edit dialog (title + URL) */}
      {editDialog && (
        <div
          className="bookmark-bar__dialog-backdrop"
          onClick={() => setEditDialog(null)}
        >
          <form
            className="bookmark-bar__dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); submitEditDialog(); }}
          >
            <div className="bookmark-bar__dialog-title">Edit bookmark</div>
            <label className="bookmark-bar__dialog-field">
              <span>Name</span>
              <input
                autoFocus
                className="bookmark-bar__dialog-input"
                value={editDialogTitle}
                onChange={(e) => setEditDialogTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditDialog(null); }}
              />
            </label>
            <label className="bookmark-bar__dialog-field">
              <span>URL</span>
              <input
                className="bookmark-bar__dialog-input"
                value={editDialogUrl}
                onChange={(e) => setEditDialogUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditDialog(null); }}
              />
            </label>
            <div className="bookmark-bar__dialog-actions">
              <button
                type="button"
                className="bookmark-bar__dialog-btn"
                onClick={() => setEditDialog(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bookmark-bar__dialog-btn bookmark-bar__dialog-btn--primary"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Folder dropdown */}
      {folderDropdown && (
        <div
          ref={folderDropdownRef}
          className="bookmark-bar__folder-dropdown"
          style={{ left: folderDropdown.x, top: folderDropdown.y }}
        >
          {folderDropdown.bookmark.children && folderDropdown.bookmark.children.length > 0 ? (
            folderDropdown.bookmark.children.map((child) => renderBookmarkItem(child, true))
          ) : (
            <span className="bookmark-bar__dropdown-empty">Empty folder</span>
          )}
        </div>
      )}
    </div>
  );
};
