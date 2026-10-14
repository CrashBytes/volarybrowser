/**
 * Toast
 *
 * Self-dismissing notice for main-process events (e.g. media saved to the vault).
 * Web content is a BrowserView that covers the content area, so the toast lives
 * in the status bar where the chrome is guaranteed to be visible.
 *
 * @module renderer/components/Toast
 */

import React, { useEffect, useRef, useState } from 'react';
import './Toast.css';

const DISMISS_MS = 3000;

export const Toast: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleShow = (_event: unknown, payload: unknown) => {
      const text = (payload as { message?: unknown } | null)?.message;
      if (typeof text !== 'string' || !text) return;
      setMessage(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), DISMISS_MS);
    };
    window.volary.on('toast:show', handleShow);
    return () => {
      window.volary.off('toast:show', handleShow);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className="toast" key={message} title={message} onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
    </div>
  );
};
