import React, { useRef, useEffect } from 'react';
import { useBrowserStore } from '../../store/browser-store';
import './FindBar.css';

export const FindBar: React.FC = () => {
  const { find, setFindText, closeFind } = useBrowserStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (find.isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [find.isOpen]);

  if (!find.isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setFindText(text);
    if (text) {
      window.volary.find.start(text);
    } else {
      window.volary.find.stop();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        window.volary.find.previous();
      } else {
        window.volary.find.next();
      }
    }
    if (e.key === 'Escape') {
      window.volary.find.stop();
      closeFind();
    }
  };

  const handleClose = () => {
    window.volary.find.stop();
    closeFind();
  };

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        type="text"
        className="find-bar__input"
        value={find.text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Find in page..."
        aria-label="Find in page"
      />
      {find.text && (
        <span className="find-bar__count">
          {find.matches > 0 ? `${find.activeMatch}/${find.matches}` : 'No matches'}
        </span>
      )}
      <button className="find-bar__btn" onClick={() => window.volary.find.previous()} title="Previous" aria-label="Previous match">&#8593;</button>
      <button className="find-bar__btn" onClick={() => window.volary.find.next()} title="Next" aria-label="Next match">&#8595;</button>
      <button className="find-bar__btn" onClick={handleClose} title="Close" aria-label="Close find bar">&times;</button>
    </div>
  );
};
