import React, { useState, useEffect, useRef } from 'react';
import { BackIcon, ForwardIcon, ReloadIcon, StopIcon, LockIcon, UnlockIcon, ReaderIcon, MoonIcon, EyeIcon, BookmarkIcon, BookmarkFilledIcon, GearIcon } from '../../assets/icons/NavIcons';
import './AddressBar.css';

interface AddressBarProps {
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onStop: () => void;
}

export const AddressBar: React.FC<AddressBarProps> = ({
  url,
  isLoading,
  canGoBack,
  canGoForward,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
}) => {
  const [inputValue, setInputValue] = useState(url);
  const [isFocused, setIsFocused] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ url: string; title: string }>>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [readerActive, setReaderActive] = useState(false);
  const [darkModeActive, setDarkModeActive] = useState(false);
  const [colorblindLabel, setColorblindLabel] = useState('Off');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external URL changes when not focused
  useEffect(() => {
    if (!isFocused) {
      setInputValue(url);
    }
  }, [url, isFocused]);

  // Load toolbar states on mount and listen for bookmark toggle from menu
  useEffect(() => {
    window.volary?.darkMode?.getStatus().then((r: any) => setDarkModeActive(r?.enabled ?? false)).catch(() => {});
    window.volary?.colorblind?.getStatus().then((r: any) => setColorblindLabel(r?.label ?? 'Off')).catch(() => {});

    const handleMenuBookmark = () => toggleBookmark();
    window.addEventListener('volary:toggle-bookmark', handleMenuBookmark);
    return () => window.removeEventListener('volary:toggle-bookmark', handleMenuBookmark);
  }, [url, isBookmarked]);

  // Reset reader mode state when URL changes (navigating away exits reader)
  useEffect(() => {
    setReaderActive(false);
  }, [url]);

  // Check bookmark status when URL changes
  useEffect(() => {
    if (url && window.volary?.bookmarks) {
      window.volary.bookmarks.isBookmarked(url).then((result: unknown) => {
        setIsBookmarked(!!result);
      }).catch(() => setIsBookmarked(false));
    } else {
      setIsBookmarked(false);
    }
  }, [url]);

  const toggleBookmark = async () => {
    if (!url) return;
    try {
      if (isBookmarked) {
        const result = await window.volary.bookmarks.isBookmarked(url) as any;
        if (result?.id) {
          await window.volary.bookmarks.delete(result.id);
        }
        setIsBookmarked(false);
      } else {
        const title = url;
        await window.volary.bookmarks.create(1, title, url);
        setIsBookmarked(true);
      }
      // Notify bookmark bar to refresh
      window.dispatchEvent(new CustomEvent('volary:bookmarks-changed'));
    } catch (err) {
      console.error('[AddressBar] Bookmark toggle failed:', err);
    }
  };

  const fetchSuggestions = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const [historyResults, bookmarkResults] = await Promise.all([
          window.volary.history.search(query, 5),
          window.volary.bookmarks.search(query, 3),
        ]);
        const seen = new Set<string>();
        const combined: Array<{ url: string; title: string }> = [];
        for (const item of [...(historyResults || []), ...(bookmarkResults || [])]) {
          if (item.url && !seen.has(item.url)) {
            seen.add(item.url);
            combined.push({ url: item.url, title: item.title });
          }
          if (combined.length >= 6) break;
        }
        setSuggestions(combined);
        setSelectedSuggestion(-1);
      } catch {
        setSuggestions([]);
      }
    }, 150);
  };

  const handleSubmit = () => {
    const value = inputValue.trim();
    if (!value) return;

    let normalizedUrl = value;
    if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('about:')) {
      if (value.includes('.') && !value.includes(' ')) {
        normalizedUrl = `https://${value}`;
      } else {
        normalizedUrl = `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
      }
    }

    onNavigate(normalizedUrl);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
        onNavigate(suggestions[selectedSuggestion].url);
        setSuggestions([]);
        inputRef.current?.blur();
      } else {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      if (suggestions.length > 0) {
        setSuggestions([]);
      } else {
        setInputValue(url);
        inputRef.current?.blur();
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    fetchSuggestions(val);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Delay clearing suggestions so click events on them can fire
    setTimeout(() => setSuggestions([]), 200);
  };

  const isSecure = url.startsWith('https://');

  return (
    <div className="address-bar" role="toolbar" aria-label="Navigation toolbar">
      <nav className="address-bar__nav" aria-label="Page navigation">
        <button
          className="address-bar__btn"
          onClick={onGoBack}
          disabled={!canGoBack}
          title="Go back"
          aria-label="Go back"
        >
          <BackIcon />
        </button>
        <button
          className="address-bar__btn"
          onClick={onGoForward}
          disabled={!canGoForward}
          title="Go forward"
          aria-label="Go forward"
        >
          <ForwardIcon />
        </button>
        <button
          className="address-bar__btn"
          onClick={isLoading ? onStop : onReload}
          title={isLoading ? 'Stop' : 'Reload'}
          aria-label={isLoading ? 'Stop loading' : 'Reload page'}
        >
          {isLoading ? <StopIcon /> : <ReloadIcon />}
        </button>
      </nav>

      <div className="address-bar__url-container">
        {!isFocused && url && (
          <span className={`address-bar__security ${isSecure ? 'address-bar__security--secure' : 'address-bar__security--insecure'}`}>
            {isSecure ? <LockIcon /> : <UnlockIcon />}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          className="address-bar__input"
          value={isFocused ? inputValue : url || inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Enter URL or search..."
          aria-label="URL address bar"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="address-bar__bookmark"
          onClick={toggleBookmark}
          title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
        >
          {isBookmarked ? <BookmarkFilledIcon /> : <BookmarkIcon />}
        </button>
      </div>

      {suggestions.length > 0 && isFocused && (
        <div className="address-bar__suggestions">
          {suggestions.map((s, i) => (
            <div
              key={s.url}
              className={`address-bar__suggestion${i === selectedSuggestion ? ' address-bar__suggestion--selected' : ''}`}
              onMouseDown={() => {
                onNavigate(s.url);
                setSuggestions([]);
              }}
            >
              <span className="suggestion__title">{s.title || s.url}</span>
              <span className="suggestion__url">{s.url}</span>
            </div>
          ))}
        </div>
      )}

      <div className="address-bar__tools" role="group" aria-label="Browser tools">
        <button
          className={`address-bar__btn${readerActive ? ' address-bar__btn--active' : ''}`}
          onClick={async () => {
            const result = await window.volary.readingMode.toggle();
            setReaderActive(result?.active ?? false);
          }}
          title="Reading mode (Cmd+Shift+R)"
          aria-label="Toggle reading mode"
        >
          <ReaderIcon />
        </button>
        <button
          className={`address-bar__btn${darkModeActive ? ' address-bar__btn--active' : ''}`}
          onClick={async () => {
            const result = await window.volary.darkMode.toggle();
            setDarkModeActive(result?.enabled ?? false);
          }}
          title="Force dark mode"
          aria-label="Toggle dark mode on websites"
        >
          <MoonIcon />
        </button>
        <button
          className={`address-bar__btn${colorblindLabel !== 'Off' ? ' address-bar__btn--active' : ''}`}
          onClick={async () => {
            const result = await window.volary.colorblind.cycle();
            setColorblindLabel(result?.label ?? 'Off');
          }}
          title={`Colorblind mode: ${colorblindLabel}`}
          aria-label="Cycle colorblind mode"
        >
          <EyeIcon />
        </button>
        <button
          className="address-bar__btn"
          onClick={() => window.dispatchEvent(new CustomEvent('volary:open-settings'))}
          title="Settings (Cmd+,)"
          aria-label="Open settings"
        >
          <GearIcon />
        </button>
      </div>

      {isLoading && <div className="address-bar__progress" />}
    </div>
  );
};
