import React, { useState, useEffect } from 'react';
import './BookmarkBar.css';

interface Bookmark {
  id: number;
  title: string;
  url: string | null;
  isFolder: boolean;
  children?: Bookmark[];
}

export const BookmarkBar: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    loadBookmarks();
    // Refresh periodically to catch new bookmarks
    const interval = setInterval(loadBookmarks, 5000);

    // Refresh immediately when a bookmark is toggled
    const handleBookmarkToggle = () => setTimeout(loadBookmarks, 200);
    window.volary.on('toggle-bookmark', handleBookmarkToggle);
    window.addEventListener('volary:bookmarks-changed', handleBookmarkToggle);

    return () => {
      clearInterval(interval);
      window.volary.off('toggle-bookmark', handleBookmarkToggle);
      window.removeEventListener('volary:bookmarks-changed', handleBookmarkToggle);
    };
  }, []);

  const loadBookmarks = async () => {
    try {
      const tree = await window.volary.bookmarks.getTree(1); // Bookmarks Bar = id 1
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

  return (
    <div className="bookmark-bar">
      {bookmarks.length === 0 ? (
        <span className="bookmark-bar__empty">Bookmarks will appear here</span>
      ) : (
        bookmarks.map((bm) => (
          <button
            key={bm.id}
            className="bookmark-bar__item"
            onClick={() => {
              if (bm.url) {
                window.volary.navigation.navigateTo(bm.url);
              }
            }}
            title={bm.url || bm.title}
          >
            {bm.url && (
              <img
                className="bookmark-bar__favicon"
                src={getFavicon(bm.url)}
                alt=""
                width="14"
                height="14"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            {bm.isFolder ? '📁 ' : ''}
            <span className="bookmark-bar__title">
              {bm.title.length > 20 ? bm.title.slice(0, 18) + '...' : bm.title}
            </span>
          </button>
        ))
      )}
    </div>
  );
};
