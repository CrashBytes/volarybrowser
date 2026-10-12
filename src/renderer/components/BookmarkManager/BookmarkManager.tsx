/**
 * Bookmark Manager
 *
 * Full editor for every bookmark and folder: browse the folder tree, search,
 * rename, change URLs, move between folders, reorder, add and delete. All
 * writes go through the existing bookmark IPC; after each change the bar is
 * told to refresh via the 'volary:bookmarks-changed' window event.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBrowserStore } from '../../store/browser-store';
import { normalizeBookmarkUrl } from './bookmark-url';
import './BookmarkManager.css';

interface Bookmark {
  id: number;
  parentId: number | null;
  title: string;
  url: string | null;
  isFolder: boolean;
  position?: number;
  children?: Bookmark[];
}

interface BookmarkManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Root folders created by the first migration. They can't be edited or removed. */
const ROOT_IDS = [1, 2];

interface Draft {
  /** id of the bookmark being edited, or 'new-bookmark' / 'new-folder' */
  key: number | 'new-bookmark' | 'new-folder';
  title: string;
  url: string;
  parentId: number;
  isFolder: boolean;
}

const notifyChanged = () => window.dispatchEvent(new CustomEvent('volary:bookmarks-changed'));

export const BookmarkManager: React.FC<BookmarkManagerProps> = ({ isOpen, onClose }) => {
  const [roots, setRoots] = useState<Bookmark[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number>(1);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeTab = useBrowserStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);

  const load = useCallback(async () => {
    try {
      const trees = await Promise.all(ROOT_IDS.map((id) => window.volary.bookmarks.getTree(id)));
      setRoots(trees.filter(Boolean) as Bookmark[]);
    } catch (e) {
      setError(`Couldn't load bookmarks: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setDraft(null);
    setPendingDelete(null);
    setError(null);
    setNotice(null);
    load();
    setTimeout(() => searchRef.current?.focus(), 0);
    window.addEventListener('volary:bookmarks-changed', load);
    return () => window.removeEventListener('volary:bookmarks-changed', load);
  }, [isOpen, load]);

  // Index the tree: id -> node and id -> parent id.
  const { byId, parentOf } = useMemo(() => {
    const byId = new Map<number, Bookmark>();
    const parentOf = new Map<number, number>();
    const walk = (node: Bookmark) => {
      byId.set(node.id, node);
      for (const child of node.children ?? []) {
        parentOf.set(child.id, node.id);
        walk(child);
      }
    };
    roots.forEach(walk);
    return { byId, parentOf };
  }, [roots]);

  // If the selected folder was deleted, fall back to the bookmarks bar.
  useEffect(() => {
    if (roots.length && !byId.has(selectedFolder)) setSelectedFolder(1);
  }, [roots, byId, selectedFolder]);

  const pathOf = useCallback((id: number): string => {
    const names: string[] = [];
    let cursor: number | undefined = id;
    while (cursor !== undefined) {
      const node = byId.get(cursor);
      if (!node) break;
      names.unshift(node.title);
      cursor = parentOf.get(cursor);
    }
    return names.join(' / ');
  }, [byId, parentOf]);

  /** Every folder, flattened with depth, for the sidebar and the "Folder" picker. */
  const folders = useMemo(() => {
    const out: Array<{ node: Bookmark; depth: number }> = [];
    const walk = (node: Bookmark, depth: number) => {
      out.push({ node, depth });
      for (const child of node.children ?? []) if (child.isFolder) walk(child, depth + 1);
    };
    roots.forEach((r) => walk(r, 0));
    return out;
  }, [roots]);

  const isInside = useCallback((candidate: number, ancestor: number): boolean => {
    let cursor: number | undefined = candidate;
    while (cursor !== undefined) {
      if (cursor === ancestor) return true;
      cursor = parentOf.get(cursor);
    }
    return false;
  }, [parentOf]);

  const trimmedQuery = query.trim().toLowerCase();
  const rows: Bookmark[] = useMemo(() => {
    if (!trimmedQuery) return byId.get(selectedFolder)?.children ?? [];
    const hits: Bookmark[] = [];
    for (const node of byId.values()) {
      if (ROOT_IDS.includes(node.id)) continue;
      if (node.title.toLowerCase().includes(trimmedQuery) || (node.url ?? '').toLowerCase().includes(trimmedQuery)) {
        hits.push(node);
      }
    }
    return hits;
  }, [trimmedQuery, byId, selectedFolder]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      notifyChanged();
      await load();
      return true;
    } catch (e) {
      setError(`${label} failed: ${(e as Error).message}`);
      return false;
    }
  };

  const startEdit = (bm: Bookmark) => {
    setPendingDelete(null);
    setNotice(null);
    setDraft({
      key: bm.id,
      title: bm.title,
      url: bm.url ?? '',
      parentId: parentOf.get(bm.id) ?? 1,
      isFolder: bm.isFolder,
    });
  };

  const startNew = (isFolder: boolean) => {
    setPendingDelete(null);
    setNotice(null);
    setQuery('');
    const pageUrl = activeTab?.url && /^https?:/i.test(activeTab.url) ? activeTab.url : '';
    setDraft({
      key: isFolder ? 'new-folder' : 'new-bookmark',
      title: isFolder ? '' : (pageUrl ? activeTab?.title || '' : ''),
      url: isFolder ? '' : pageUrl,
      parentId: selectedFolder,
      isFolder,
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    let url: string | null = null;
    if (!draft.isFolder) {
      url = normalizeBookmarkUrl(draft.url);
      if (!url) {
        setError('Enter a web address that starts with http:// or https://, or a site name like example.com.');
        return;
      }
    }
    if (!title && draft.isFolder) {
      setError('A folder needs a name.');
      return;
    }
    const name = title || url!;

    if (draft.key === 'new-bookmark' || draft.key === 'new-folder') {
      if (!draft.isFolder && url) {
        const existing = await window.volary.bookmarks.isBookmarked(url) as Bookmark | null;
        if (existing) {
          setError(`That address is already bookmarked in ${pathOf(existing.parentId ?? 1)}.`);
          return;
        }
      }
      const ok = await run('Adding', () => window.volary.bookmarks.create(draft.parentId, name, url, draft.isFolder));
      if (ok) {
        setDraft(null);
        setNotice(draft.isFolder ? `Folder "${name}" added.` : `Bookmark "${name}" added.`);
      }
      return;
    }

    const original = byId.get(draft.key);
    if (!original) { setDraft(null); return; }
    const ok = await run('Saving', async () => {
      const titleChanged = name !== original.title;
      const urlChanged = !draft.isFolder && url !== original.url;
      if (titleChanged || urlChanged) {
        await window.volary.bookmarks.update(
          original.id,
          titleChanged ? name : undefined,
          urlChanged ? url ?? undefined : undefined,
        );
      }
      if (draft.parentId !== (parentOf.get(original.id) ?? 1)) {
        const destination = byId.get(draft.parentId);
        await window.volary.bookmarks.move(original.id, draft.parentId, destination?.children?.length ?? 0);
      }
    });
    if (ok) setDraft(null);
  };

  const shift = async (bm: Bookmark, delta: -1 | 1) => {
    const parentId = parentOf.get(bm.id);
    if (parentId === undefined) return;
    const siblings = byId.get(parentId)?.children ?? [];
    const index = siblings.findIndex((s) => s.id === bm.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    // move() takes "before the item currently at N"; moving down one slot
    // means landing before the item two below.
    await run('Reordering', () => window.volary.bookmarks.move(bm.id, parentId, delta === 1 ? target + 1 : target));
  };

  const remove = async (bm: Bookmark) => {
    if (pendingDelete !== bm.id) {
      setPendingDelete(bm.id);
      return;
    }
    setPendingDelete(null);
    const ok = await run('Deleting', () => window.volary.bookmarks.delete(bm.id));
    if (ok) setNotice(`Deleted "${bm.title}".`);
  };

  const open = (bm: Bookmark) => {
    if (bm.isFolder) {
      setQuery('');
      setSelectedFolder(bm.id);
      return;
    }
    if (bm.url) {
      window.volary.navigation.navigateTo(bm.url);
      onClose();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (draft) setDraft(null);
    else if (pendingDelete !== null) setPendingDelete(null);
    else onClose();
  };

  if (!isOpen) return null;

  const countItems = (node: Bookmark): number =>
    (node.children ?? []).reduce((n, c) => n + 1 + (c.isFolder ? countItems(c) : 0), 0);

  const renderEditor = () => {
    if (!draft) return null;
    const editingId = typeof draft.key === 'number' ? draft.key : null;
    const folderChoices = folders.filter(({ node }) =>
      editingId === null || !draft.isFolder || !isInside(node.id, editingId));
    return (
      <form
        className="bm-editor"
        onSubmit={(e) => { e.preventDefault(); saveDraft(); }}
        aria-label={editingId === null ? (draft.isFolder ? 'New folder' : 'New bookmark') : 'Edit bookmark'}
      >
        <label className="bm-field">
          <span>Name</span>
          <input
            autoFocus
            value={draft.title}
            placeholder={draft.isFolder ? 'Folder name' : 'Defaults to the address'}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        {!draft.isFolder && (
          <label className="bm-field">
            <span>Address</span>
            <input
              value={draft.url}
              placeholder="https://example.com"
              spellCheck={false}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            />
          </label>
        )}
        <label className="bm-field">
          <span>Folder</span>
          <select
            value={draft.parentId}
            onChange={(e) => setDraft({ ...draft, parentId: Number(e.target.value) })}
          >
            {folderChoices.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(depth)}{node.title}
              </option>
            ))}
          </select>
        </label>
        <div className="bm-editor-actions">
          <button type="button" className="bm-btn" onClick={() => setDraft(null)}>Cancel</button>
          <button type="submit" className="bm-btn bm-btn--primary">Save</button>
        </div>
      </form>
    );
  };

  const renderRow = (bm: Bookmark, index: number, total: number) => {
    if (draft?.key === bm.id) return <li key={bm.id} className="bm-row bm-row--editing">{renderEditor()}</li>;
    const confirming = pendingDelete === bm.id;
    const childCount = bm.isFolder ? countItems(bm) : 0;
    return (
      <li key={bm.id} className="bm-row">
        <button
          className="bm-row-main"
          onDoubleClick={() => open(bm)}
          onClick={() => bm.isFolder && open(bm)}
          title={bm.isFolder ? `Open folder ${bm.title}` : `${bm.url}\nDouble-click to open`}
        >
          <span className="bm-row-icon" aria-hidden>{bm.isFolder ? '📁' : '🔖'}</span>
          <span className="bm-row-text">
            <span className="bm-row-title">{bm.title}</span>
            <span className="bm-row-sub">
              {bm.isFolder
                ? `${childCount} item${childCount === 1 ? '' : 's'}`
                : bm.url}
              {trimmedQuery && ` · in ${pathOf(parentOf.get(bm.id) ?? 1)}`}
            </span>
          </span>
        </button>
        <div className="bm-row-actions">
          {!trimmedQuery && (
            <>
              <button className="bm-icon-btn" onClick={() => shift(bm, -1)} disabled={index === 0}
                aria-label={`Move ${bm.title} up`} title="Move up">↑</button>
              <button className="bm-icon-btn" onClick={() => shift(bm, 1)} disabled={index === total - 1}
                aria-label={`Move ${bm.title} down`} title="Move down">↓</button>
            </>
          )}
          {!bm.isFolder && (
            <button className="bm-btn" onClick={() => open(bm)}>Open</button>
          )}
          <button className="bm-btn" onClick={() => startEdit(bm)}>Edit</button>
          <button
            className={`bm-btn bm-btn--danger${confirming ? ' bm-btn--confirm' : ''}`}
            onClick={() => remove(bm)}
            onBlur={() => confirming && setPendingDelete(null)}
          >
            {confirming
              ? (bm.isFolder && childCount > 0 ? `Delete folder + ${childCount}?` : 'Confirm delete')
              : 'Delete'}
          </button>
        </div>
      </li>
    );
  };

  const selected = byId.get(selectedFolder);
  const isNewDraft = draft && typeof draft.key !== 'number';

  return (
    <div className="bm-overlay" onClick={onClose} onKeyDown={onKeyDown}>
      <div
        className="bm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Bookmark manager"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bm-header">
          <h1>Bookmarks</h1>
          <input
            ref={searchRef}
            className="bm-search"
            type="search"
            placeholder="Search bookmarks"
            aria-label="Search bookmarks"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setDraft(null); }}
          />
          <button className="bm-close" onClick={onClose} aria-label="Close bookmark manager">×</button>
        </header>

        <div className="bm-body">
          <nav className="bm-sidebar" aria-label="Bookmark folders">
            {folders.map(({ node, depth }) => (
              <button
                key={node.id}
                className={`bm-folder${!trimmedQuery && node.id === selectedFolder ? ' bm-folder--active' : ''}`}
                style={{ paddingLeft: 12 + depth * 14 }}
                onClick={() => { setQuery(''); setDraft(null); setSelectedFolder(node.id); }}
              >
                <span aria-hidden>📁</span> {node.title}
              </button>
            ))}
          </nav>

          <section className="bm-main">
            <div className="bm-toolbar">
              <span className="bm-crumb">
                {trimmedQuery ? `${rows.length} result${rows.length === 1 ? '' : 's'} for "${query.trim()}"` : (selected ? pathOf(selected.id) : '')}
              </span>
              <button className="bm-btn" onClick={() => startNew(false)}>+ Bookmark</button>
              <button className="bm-btn" onClick={() => startNew(true)}>+ Folder</button>
            </div>

            {error && <div className="bm-message bm-message--error" role="alert">{error}</div>}
            {notice && !error && <div className="bm-message" role="status">{notice}</div>}

            {isNewDraft && <div className="bm-row bm-row--editing">{renderEditor()}</div>}

            {rows.length === 0 && !isNewDraft ? (
              <div className="bm-empty">
                {trimmedQuery ? 'No bookmarks match.' : 'This folder is empty.'}
              </div>
            ) : (
              <ul className="bm-list">
                {rows.map((bm, i) => renderRow(bm, i, rows.length))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
