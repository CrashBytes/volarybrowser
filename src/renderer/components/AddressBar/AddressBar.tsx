import React, { useState, useEffect, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external URL changes when not focused
  useEffect(() => {
    if (!isFocused) {
      setInputValue(url);
    }
  }, [url, isFocused]);

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
    if (e.key === 'Enter') {
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setInputValue(url);
      inputRef.current?.blur();
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const isSecure = url.startsWith('https://');

  return (
    <div className="address-bar">
      <div className="address-bar__nav">
        <button
          className="address-bar__btn"
          onClick={onGoBack}
          disabled={!canGoBack}
          title="Go back"
          aria-label="Go back"
        >
          &#8592;
        </button>
        <button
          className="address-bar__btn"
          onClick={onGoForward}
          disabled={!canGoForward}
          title="Go forward"
          aria-label="Go forward"
        >
          &#8594;
        </button>
        <button
          className="address-bar__btn"
          onClick={isLoading ? onStop : onReload}
          title={isLoading ? 'Stop' : 'Reload'}
          aria-label={isLoading ? 'Stop loading' : 'Reload page'}
        >
          {isLoading ? '\u00D7' : '\u21BB'}
        </button>
      </div>

      <div className="address-bar__url-container">
        {!isFocused && url && (
          <span className={`address-bar__security ${isSecure ? 'address-bar__security--secure' : 'address-bar__security--insecure'}`}>
            {isSecure ? '\uD83D\uDD12' : '\uD83D\uDD13'}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          className="address-bar__input"
          value={isFocused ? inputValue : url || inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Enter URL or search..."
          aria-label="URL address bar"
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {isLoading && <div className="address-bar__progress" />}
    </div>
  );
};
