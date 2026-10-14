/**
 * Translate Bar
 *
 * Sits under the address bar and reflects the active tab's translation
 * state: offers to translate a foreign-language page, shows progress,
 * and lets the user go back to the original or change the rules.
 */

import React from 'react';
import { useBrowserStore } from '../../store/browser-store';
import { TranslateIcon } from '../../assets/icons/NavIcons';
import './TranslateBar.css';

export const TranslateBar: React.FC = () => {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const state = useBrowserStore((s) => (s.activeTabId ? s.translate[s.activeTabId] : undefined));
  const [busy, setBusy] = React.useState(false);

  if (!activeTabId || !state) return null;
  if (state.status === 'idle' || state.status === 'dismissed') return null;

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.error('[TranslateBar] action failed:', error);
    } finally {
      setBusy(false);
    }
  };

  const source = state.sourceName ?? 'another language';
  const target = state.targetName;

  let message: string;
  switch (state.status) {
    case 'offer':
      message = `This page is in ${source}. Translate to ${target}?`;
      break;
    case 'translating':
      message = state.segments > 0
        ? `Translating to ${target}... ${state.segments} segments so far`
        : `Translating to ${target}...`;
      break;
    case 'translated':
      message = state.sourceName
        ? `Translated from ${source} to ${target}.`
        : `Translated to ${target}.`;
      break;
    case 'error':
      message = state.error ? `Translation failed: ${state.error}` : 'Translation failed.';
      break;
    default:
      message = '';
  }

  return (
    <div className={`translate-bar translate-bar--${state.status}`} role="region" aria-label="Page translation" aria-live="polite">
      <span className="translate-bar__icon" aria-hidden="true"><TranslateIcon size={16} /></span>
      <span className="translate-bar__message">{message}</span>

      <div className="translate-bar__actions">
        {state.status === 'offer' && (
          <>
            <button
              className="translate-bar__btn translate-bar__btn--primary"
              onClick={() => run(() => window.volary.translate.page(activeTabId))}
              disabled={busy}
            >
              Translate
            </button>
            {state.sourceLang && (
              <button
                className="translate-bar__btn"
                onClick={() => run(() => window.volary.translate.alwaysLang(state.sourceLang as string, activeTabId))}
                disabled={busy}
                title={`Translate every ${source} page without asking`}
              >
                Always translate {source}
              </button>
            )}
            <details className="translate-bar__more">
              <summary className="translate-bar__btn" aria-label="More translation options">More</summary>
              <div className="translate-bar__menu" role="menu">
                {state.sourceLang && (
                  <button
                    role="menuitem"
                    className="translate-bar__menu-item"
                    onClick={() => run(() => window.volary.translate.neverLang(state.sourceLang as string))}
                  >
                    Never translate {source}
                  </button>
                )}
                <button
                  role="menuitem"
                  className="translate-bar__menu-item"
                  onClick={() => run(() => window.volary.translate.neverSite(undefined, activeTabId))}
                >
                  Never translate this site
                </button>
              </div>
            </details>
          </>
        )}

        {state.status === 'translated' && (
          <button
            className="translate-bar__btn"
            onClick={() => run(() => window.volary.translate.restore(activeTabId))}
            disabled={busy}
          >
            Show original
          </button>
        )}

        {state.status === 'error' && (
          <button
            className="translate-bar__btn translate-bar__btn--primary"
            onClick={() => run(() => window.volary.translate.page(activeTabId))}
            disabled={busy}
          >
            Retry
          </button>
        )}

        {state.status === 'translating' && (
          <button
            className="translate-bar__btn"
            onClick={() => run(() => window.volary.translate.restore(activeTabId))}
            disabled={busy}
          >
            Cancel
          </button>
        )}

        {state.status !== 'translating' && (
          <button
            className="translate-bar__close"
            onClick={() => run(() => window.volary.translate.dismiss(activeTabId))}
            title="Close"
            aria-label="Close translation bar"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
};
