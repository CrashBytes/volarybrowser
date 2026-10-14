/**
 * Vault Media gallery
 *
 * Shows media saved to the encrypted vault. Files are decrypted in the main
 * process only while the vault is unlocked and handed to this view as bytes;
 * previews live in in-memory blob: URLs that are revoked when the gallery
 * closes or the vault locks. Nothing decrypted is written to disk except an
 * explicit "Export" to a path the user picks.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './VaultMedia.css';

interface MediaEntry {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  mime: string;
  size: number;
  savedAt: number;
  sourceUrl?: string;
}

interface VaultMediaProps {
  isOpen: boolean;
  isUnlocked: boolean;
  onClose: () => void;
  onRequestUnlock: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const THUMB_LIMIT = 25 * 1024 * 1024; // don't auto-decrypt huge files for thumbnails

export const VaultMedia: React.FC<VaultMediaProps> = ({ isOpen, isUnlocked, onClose, onRequestUnlock }) => {
  const [items, setItems] = useState<MediaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<{ entry: MediaEntry; url: string } | null>(null);
  const urlsRef = useRef<Set<string>>(new Set());
  const closeRef = useRef<HTMLButtonElement>(null);

  const track = (url: string) => { urlsRef.current.add(url); return url; };
  const revokeAll = useCallback(() => {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current.clear();
    setThumbs({});
    setViewing(null);
  }, []);

  const decrypt = async (id: string): Promise<{ entry: MediaEntry; url: string } | null> => {
    const res = await window.volary.vaultMedia.read(id);
    if (!res?.success || !res.data || !res.entry) return null;
    const blob = new Blob([new Uint8Array(res.data)], { type: res.entry.mime });
    return { entry: res.entry, url: track(URL.createObjectURL(blob)) };
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.volary.vaultMedia.list();
      if (res.locked) { setItems([]); return; }
      setItems(res.items);
      for (const item of res.items as MediaEntry[]) {
        if (item.type !== 'image' || item.size > THUMB_LIMIT) continue;
        const d = await decrypt(item.id);
        if (d) setThumbs((t) => ({ ...t, [item.id]: d.url }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load when opened/unlocked; drop every decrypted preview on close or lock
  useEffect(() => {
    if (isOpen && isUnlocked) {
      load();
    } else {
      revokeAll();
      setItems([]);
    }
  }, [isOpen, isUnlocked, load, revokeAll]);

  useEffect(() => () => revokeAll(), [revokeAll]);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (viewing) setViewing(null); else onClose();
    }
  };

  const openItem = async (item: MediaEntry) => {
    const existing = thumbs[item.id];
    if (existing) { setViewing({ entry: item, url: existing }); return; }
    const d = await decrypt(item.id);
    if (d) setViewing(d); else setError('Could not decrypt this file');
  };

  const exportItem = async (item: MediaEntry) => {
    const res = await window.volary.vaultMedia.export(item.id);
    if (!res.success && res.message !== 'Cancelled') setError(res.message || 'Export failed');
  };

  const deleteItem = async (item: MediaEntry) => {
    if (!window.confirm(`Delete "${item.name}" from the vault? This cannot be undone.`)) return;
    const res = await window.volary.vaultMedia.delete(item.id);
    if (!res.success) { setError('Delete failed'); return; }
    const url = thumbs[item.id];
    if (url) { URL.revokeObjectURL(url); urlsRef.current.delete(url); }
    if (viewing?.entry.id === item.id) setViewing(null);
    setItems((list) => list.filter((i) => i.id !== item.id));
  };

  if (!isOpen) return null;

  return (
    <div className="vault-media-overlay" onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-labelledby="vault-media-title">
      <div className="vault-media-modal">
        <header className="vault-media-header">
          <h1 id="vault-media-title">🔒 Saved Media</h1>
          <span className="vault-media-sub">Encrypted with your vault password</span>
          <button ref={closeRef} className="vault-media-close" onClick={onClose} aria-label="Close saved media">×</button>
        </header>

        {!isUnlocked ? (
          <div className="vault-media-empty">
            <p>The vault is locked. Unlock it to view your saved media.</p>
            <button className="vault-media-btn vault-media-btn--primary" onClick={onRequestUnlock}>Unlock Vault</button>
          </div>
        ) : (
          <>
            {error && <div className="vault-media-error" role="alert">{error}</div>}
            {loading && items.length === 0 && <div className="vault-media-empty">Decrypting…</div>}
            {!loading && items.length === 0 && !error && (
              <div className="vault-media-empty">
                <p>No saved media yet.</p>
                <p className="vault-media-hint">Right-click an image or video on any page and choose “Save to Vault”.</p>
              </div>
            )}
            <ul className="vault-media-grid">
              {items.map((item) => (
                <li key={item.id} className="vault-media-card">
                  <button className="vault-media-thumb" onClick={() => openItem(item)} aria-label={`View ${item.name}`}>
                    {thumbs[item.id]
                      ? <img src={thumbs[item.id]} alt="" />
                      : <span className="vault-media-icon">{item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '🖼️'}</span>}
                  </button>
                  <div className="vault-media-meta">
                    <span className="vault-media-name" title={item.name}>{item.name}</span>
                    <span className="vault-media-size">{formatSize(item.size)} · {new Date(item.savedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="vault-media-actions">
                    <button className="vault-media-btn" onClick={() => exportItem(item)}>Export</button>
                    <button className="vault-media-btn vault-media-btn--danger" onClick={() => deleteItem(item)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {viewing && (
        <div className="vault-media-viewer" onClick={() => setViewing(null)} role="dialog" aria-label={viewing.entry.name}>
          <div className="vault-media-viewer-body" onClick={(e) => e.stopPropagation()}>
            {viewing.entry.type === 'video' && <video src={viewing.url} controls autoPlay />}
            {viewing.entry.type === 'audio' && <audio src={viewing.url} controls autoPlay />}
            {viewing.entry.type === 'image' && <img src={viewing.url} alt={viewing.entry.name} />}
            <div className="vault-media-viewer-bar">
              <span>{viewing.entry.name}</span>
              <button className="vault-media-btn" onClick={() => exportItem(viewing.entry)}>Export</button>
              <button className="vault-media-btn" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
