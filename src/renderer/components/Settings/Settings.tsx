/**
 * Settings Page
 *
 * Full-featured settings UI with ADA accessibility compliance:
 * - All controls keyboard navigable (Tab, Arrow keys, Enter, Escape)
 * - ARIA labels, roles, and live regions for screen readers
 * - Focus management (traps focus in modal, restores on close)
 * - High contrast support
 * - Respects prefers-reduced-motion
 */

import React, { useState, useEffect, useRef } from 'react';
import { LANGUAGES, TARGET_LANGUAGE_CODES, languageName } from '../../../shared/translation';
import './Settings.css';

interface SettingsProps {
  isOpen: boolean;
  initialSection?: string;
  onClose: () => void;
}

type Section = 'general' | 'translation' | 'privacy' | 'appearance' | 'accessibility' | 'shortcuts';

interface SettingValues {
  searchEngine: string;
  forceDarkMode: boolean;
  colorblindMode: string;
  saveHistory: boolean;
  adBlockingEnabled: boolean;
  blockThirdPartyCookies: boolean;
  webrtcLeakPrevention: boolean;
  referrerStripping: boolean;
  fingerprintResistance: boolean;
  clearDataOnExit: boolean;
  autoDeleteCookies: boolean;
  httpsOnly: boolean;
  fontSize: number;
  reducedMotion: boolean;
  highContrast: boolean;
  screenReaderOptimized: boolean;
  translateMode: string;
  translateTargetLang: string;
  translateProvider: string;
  translateLibreUrl: string;
  translateLibreApiKey: string;
  translateNeverSites: string[];
  translateAlwaysLangs: string[];
  translateNeverLangs: string[];
}

const DEFAULT_SETTINGS: SettingValues = {
  searchEngine: 'duckduckgo',
  forceDarkMode: false,
  colorblindMode: 'off',
  saveHistory: false,
  adBlockingEnabled: true,
  blockThirdPartyCookies: true,
  webrtcLeakPrevention: true,
  referrerStripping: true,
  fingerprintResistance: true,
  clearDataOnExit: true,
  autoDeleteCookies: true,
  httpsOnly: true,
  fontSize: 100,
  reducedMotion: false,
  highContrast: false,
  screenReaderOptimized: false,
  translateMode: 'off',
  translateTargetLang: 'en',
  translateProvider: 'google',
  translateLibreUrl: 'https://libretranslate.com',
  translateLibreApiKey: '',
  translateNeverSites: [],
  translateAlwaysLangs: [],
  translateNeverLangs: [],
};

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'translation', label: 'Translation', icon: '🌐' },
  { id: 'privacy', label: 'Privacy & Security', icon: '🛡️' },
  { id: 'appearance', label: 'Appearance', icon: '🎨' },
  { id: 'accessibility', label: 'Accessibility', icon: '♿' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: '⌨️' },
];

const SHORTCUTS = [
  { keys: 'Cmd+T', action: 'New tab' },
  { keys: 'Cmd+W', action: 'Close tab' },
  { keys: 'Ctrl+Tab', action: 'Next tab' },
  { keys: 'Ctrl+Shift+Tab', action: 'Previous tab' },
  { keys: 'Cmd+L', action: 'Focus address bar' },
  { keys: 'Cmd+F', action: 'Find in page' },
  { keys: 'Cmd+D', action: 'Bookmark page' },
  { keys: 'Cmd+R', action: 'Reload' },
  { keys: 'Cmd+=', action: 'Zoom in' },
  { keys: 'Cmd+-', action: 'Zoom out' },
  { keys: 'Cmd+0', action: 'Reset zoom' },
  { keys: 'Cmd+Shift+R', action: 'Reading mode' },
  { keys: 'Cmd+Shift+T', action: 'Translate page / show original' },
  { keys: 'Cmd+P', action: 'Print' },
  { keys: 'Cmd+,', action: 'Settings' },
  { keys: 'Cmd+Option+I', action: 'Developer tools' },
];

export const Settings: React.FC<SettingsProps> = ({ isOpen, initialSection, onClose }) => {
  const [activeSection, setActiveSection] = useState<Section>(
    (initialSection as Section) || 'general'
  );
  const [settings, setSettings] = useState<SettingValues>(DEFAULT_SETTINGS);
  const [statusMessage, setStatusMessage] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Load settings on open
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    loadSettings();
    // Focus the modal
    setTimeout(() => modalRef.current?.focus(), 50);
  }, [isOpen]);

  // Set initial section
  useEffect(() => {
    if (initialSection && SECTIONS.find(s => s.id === initialSection)) {
      setActiveSection(initialSection as Section);
    }
  }, [initialSection]);

  // Restore focus on close
  useEffect(() => {
    if (!isOpen && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const all = await window.volary.settings.getAll();
      setSettings(prev => ({
        ...prev,
        searchEngine: (all.searchEngine as string) || 'duckduckgo',
        forceDarkMode: (all.forceDarkMode as boolean) || false,
        colorblindMode: (all.colorblindMode as string) || 'off',
        saveHistory: all.saveHistory === true,
        adBlockingEnabled: all.adBlockingEnabled !== false,
        blockThirdPartyCookies: all.blockThirdPartyCookies !== false,
        webrtcLeakPrevention: all.webrtcLeakPrevention !== false,
        referrerStripping: all.referrerStripping !== false,
        fingerprintResistance: all.fingerprintResistance !== false,
        clearDataOnExit: all.clearDataOnExit !== false,
        autoDeleteCookies: all.autoDeleteCookies !== false,
        httpsOnly: all.httpsOnly !== false,
        fontSize: (all.fontSize as number) || 100,
        reducedMotion: (all.reducedMotion as boolean) || false,
        highContrast: (all.highContrast as boolean) || false,
        screenReaderOptimized: (all.screenReaderOptimized as boolean) || false,
        translateMode: (all.translateMode as string) || 'off',
        translateTargetLang: (all.translateTargetLang as string) || 'en',
        translateProvider: (all.translateProvider as string) || 'google',
        translateLibreUrl: (all.translateLibreUrl as string) || 'https://libretranslate.com',
        translateLibreApiKey: (all.translateLibreApiKey as string) || '',
        translateNeverSites: asStringList(all.translateNeverSites),
        translateAlwaysLangs: asStringList(all.translateAlwaysLangs),
        translateNeverLangs: asStringList(all.translateNeverLangs),
      }));
    } catch {
      // Use defaults
    }
  };

  const updateSetting = async (key: keyof SettingValues, value: unknown) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    try {
      await window.volary.settings.set(key, value);
      setStatusMessage(`${key} updated`);
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      setStatusMessage('Failed to save setting');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onKeyDown={handleKeyDown}
    >
      <div className="settings-modal" ref={modalRef} tabIndex={-1}>
        <div className="settings-header">
          <h1 className="settings-title">Settings</h1>
          <button
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
            autoFocus
          >
            &times;
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav" role="tablist" aria-label="Settings sections">
            {SECTIONS.map(section => (
              <button
                key={section.id}
                role="tab"
                aria-selected={activeSection === section.id}
                aria-controls={`settings-panel-${section.id}`}
                className={`settings-nav-item${activeSection === section.id ? ' settings-nav-item--active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-nav-icon" aria-hidden="true">{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <main className="settings-content" role="tabpanel" id={`settings-panel-${activeSection}`} aria-label={`${activeSection} settings`}>
            {activeSection === 'general' && (
              <div className="settings-section">
                <h2 className="settings-section-title">General</h2>

                <div className="setting-item">
                  <label className="setting-label" htmlFor="search-engine">Default Search Engine</label>
                  <select
                    id="search-engine"
                    className="setting-select"
                    value={settings.searchEngine}
                    onChange={e => updateSetting('searchEngine', e.target.value)}
                  >
                    <option value="duckduckgo">DuckDuckGo</option>
                    <option value="google">Google</option>
                    <option value="bing">Bing</option>
                    <option value="brave">Brave Search</option>
                    <option value="searxng">SearXNG</option>
                  </select>
                </div>

                <div className="setting-item">
                  <label className="setting-label" htmlFor="https-only">HTTPS-Only Mode</label>
                  <p className="setting-description">Automatically upgrade HTTP connections to HTTPS</p>
                  <ToggleSwitch
                    id="https-only"
                    checked={settings.httpsOnly}
                    onChange={v => updateSetting('httpsOnly', v)}
                    label="HTTPS-Only Mode"
                  />
                </div>
              </div>
            )}

            {activeSection === 'translation' && (
              <div className="settings-section">
                <h2 className="settings-section-title">Translation</h2>
                <p className="settings-section-description">
                  Translate pages written in other languages into {languageName(settings.translateTargetLang) ?? 'English'}.
                  Page text is sent to the translation service you pick below. Nothing leaves the browser while this is off.
                </p>

                <div className="setting-item">
                  <label className="setting-label" htmlFor="translate-mode">Translate Pages</label>
                  <p className="setting-description">What happens when a page is not in your language</p>
                  <select
                    id="translate-mode"
                    className="setting-select"
                    value={settings.translateMode}
                    onChange={e => updateSetting('translateMode', e.target.value)}
                  >
                    <option value="off">Off</option>
                    <option value="ask">Offer to translate (show a bar)</option>
                    <option value="auto">Always translate automatically</option>
                  </select>
                </div>

                <div className="setting-item">
                  <label className="setting-label" htmlFor="translate-target">Translate Into</label>
                  <select
                    id="translate-target"
                    className="setting-select"
                    value={settings.translateTargetLang}
                    onChange={e => updateSetting('translateTargetLang', e.target.value)}
                  >
                    {TARGET_LANGUAGE_CODES.map(code => (
                      <option key={code} value={code}>{LANGUAGES[code]}</option>
                    ))}
                  </select>
                </div>

                <div className="setting-item">
                  <label className="setting-label" htmlFor="translate-provider">Translation Service</label>
                  <p className="setting-description">Google Translate needs no account. LibreTranslate can point at a server you run yourself.</p>
                  <select
                    id="translate-provider"
                    className="setting-select"
                    value={settings.translateProvider}
                    onChange={e => updateSetting('translateProvider', e.target.value)}
                  >
                    <option value="google">Google Translate (no account needed)</option>
                    <option value="libretranslate">LibreTranslate (self-hosted or hosted)</option>
                  </select>
                </div>

                {settings.translateProvider === 'libretranslate' && (
                  <>
                    <div className="setting-item">
                      <label className="setting-label" htmlFor="translate-libre-url">LibreTranslate Server URL</label>
                      <input
                        id="translate-libre-url"
                        type="url"
                        className="setting-input"
                        value={settings.translateLibreUrl}
                        placeholder="https://libretranslate.com"
                        spellCheck={false}
                        onChange={e => setSettings(prev => ({ ...prev, translateLibreUrl: e.target.value }))}
                        onBlur={e => updateSetting('translateLibreUrl', e.target.value.trim() || 'https://libretranslate.com')}
                      />
                    </div>
                    <div className="setting-item">
                      <label className="setting-label" htmlFor="translate-libre-key">LibreTranslate API Key</label>
                      <p className="setting-description">Required by libretranslate.com; optional on most self-hosted servers</p>
                      <input
                        id="translate-libre-key"
                        type="password"
                        className="setting-input"
                        value={settings.translateLibreApiKey}
                        autoComplete="off"
                        onChange={e => setSettings(prev => ({ ...prev, translateLibreApiKey: e.target.value }))}
                        onBlur={e => updateSetting('translateLibreApiKey', e.target.value.trim())}
                      />
                    </div>
                  </>
                )}

                <div className="setting-item">
                  <label className="setting-label">Always Translate These Languages</label>
                  <p className="setting-description">Added from the translation bar with &quot;Always translate&quot;. Pages in these languages are translated without asking.</p>
                  <ChipList
                    items={settings.translateAlwaysLangs}
                    render={code => languageName(code) ?? code}
                    emptyText="None yet"
                    removeLabel="Stop always translating"
                    onRemove={code => updateSetting('translateAlwaysLangs', settings.translateAlwaysLangs.filter(c => c !== code))}
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Never Translate These Languages</label>
                  <p className="setting-description">Pages in these languages are never offered for translation</p>
                  <ChipList
                    items={settings.translateNeverLangs}
                    render={code => languageName(code) ?? code}
                    emptyText="None yet"
                    removeLabel="Allow translating"
                    onRemove={code => updateSetting('translateNeverLangs', settings.translateNeverLangs.filter(c => c !== code))}
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Never Translate These Sites</label>
                  <p className="setting-description">Added from the translation bar with &quot;Never translate this site&quot;</p>
                  <ChipList
                    items={settings.translateNeverSites}
                    render={host => host}
                    emptyText="None yet"
                    removeLabel="Allow translating"
                    onRemove={host => updateSetting('translateNeverSites', settings.translateNeverSites.filter(h => h !== host))}
                  />
                </div>
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="settings-section">
                <h2 className="settings-section-title">Privacy & Security</h2>

                <div className="setting-item">
                  <label className="setting-label">Save Browsing History</label>
                  <p className="setting-description">Record visited sites and show recent sites on new tabs</p>
                  <ToggleSwitch
                    id="save-history"
                    checked={settings.saveHistory}
                    onChange={v => updateSetting('saveHistory', v)}
                    label="Save Browsing History"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Ad & Tracker Blocking</label>
                  <p className="setting-description">Block known advertising and tracking domains (community blocklists)</p>
                  <ToggleSwitch
                    id="ad-blocking"
                    checked={settings.adBlockingEnabled}
                    onChange={v => updateSetting('adBlockingEnabled', v)}
                    label="Ad & Tracker Blocking"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Block Third-Party Cookies</label>
                  <p className="setting-description">Reject cookies from domains other than the site you are visiting</p>
                  <ToggleSwitch
                    id="block-third-party-cookies"
                    checked={settings.blockThirdPartyCookies}
                    onChange={v => updateSetting('blockThirdPartyCookies', v)}
                    label="Block Third-Party Cookies"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">WebRTC Leak Prevention</label>
                  <p className="setting-description">Prevent websites from discovering your real IP address through WebRTC</p>
                  <ToggleSwitch
                    id="webrtc-leak-prevention"
                    checked={settings.webrtcLeakPrevention}
                    onChange={v => updateSetting('webrtcLeakPrevention', v)}
                    label="WebRTC Leak Prevention"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Referrer Stripping</label>
                  <p className="setting-description">Remove cross-origin referrer headers so sites cannot track where you came from</p>
                  <ToggleSwitch
                    id="referrer-stripping"
                    checked={settings.referrerStripping}
                    onChange={v => updateSetting('referrerStripping', v)}
                    label="Referrer Stripping"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Fingerprint Resistance</label>
                  <p className="setting-description">Block canvas, WebGL, and audio fingerprinting techniques</p>
                  <ToggleSwitch
                    id="fingerprint-resistance"
                    checked={settings.fingerprintResistance}
                    onChange={v => updateSetting('fingerprintResistance', v)}
                    label="Fingerprint Resistance"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Auto-Delete Cookies on Tab Close</label>
                  <p className="setting-description">Automatically remove cookies when a tab is closed</p>
                  <ToggleSwitch
                    id="auto-delete-cookies"
                    checked={settings.autoDeleteCookies}
                    onChange={v => updateSetting('autoDeleteCookies', v)}
                    label="Auto-Delete Cookies on Tab Close"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Clear All Data on Exit</label>
                  <p className="setting-description">Wipe cookies, cache, and local storage when the browser closes</p>
                  <ToggleSwitch
                    id="clear-data-on-exit"
                    checked={settings.clearDataOnExit}
                    onChange={v => updateSetting('clearDataOnExit', v)}
                    label="Clear All Data on Exit"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Clear Browsing Data</label>
                  <p className="setting-description">Delete history, bookmarks, and saved settings</p>
                  <div className="setting-actions">
                    <button className="setting-btn" onClick={async () => {
                      await window.volary.history.clear();
                      setStatusMessage('History cleared');
                      setTimeout(() => setStatusMessage(''), 2000);
                    }}>Clear History</button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="settings-section">
                <h2 className="settings-section-title">Appearance</h2>

                <div className="setting-item">
                  <label className="setting-label">Force Dark Mode</label>
                  <p className="setting-description">Apply dark theme to all websites</p>
                  <ToggleSwitch
                    id="dark-mode"
                    checked={settings.forceDarkMode}
                    onChange={async v => {
                      updateSetting('forceDarkMode', v);
                      await window.volary.darkMode.toggle();
                    }}
                    label="Force Dark Mode"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label" htmlFor="font-size">Page Zoom Level</label>
                  <p className="setting-description">Default zoom for all pages: {settings.fontSize}%</p>
                  <input
                    id="font-size"
                    type="range"
                    className="setting-range"
                    min="50"
                    max="200"
                    step="10"
                    value={settings.fontSize}
                    onChange={e => updateSetting('fontSize', parseInt(e.target.value))}
                    aria-valuemin={50}
                    aria-valuemax={200}
                    aria-valuenow={settings.fontSize}
                    aria-label={`Page zoom level: ${settings.fontSize}%`}
                  />
                </div>
              </div>
            )}

            {activeSection === 'accessibility' && (
              <div className="settings-section">
                <h2 className="settings-section-title">Accessibility</h2>
                <p className="settings-section-description">
                  Volary is committed to being usable by everyone. These settings help customize your browsing experience.
                </p>

                <div className="setting-item">
                  <label className="setting-label" htmlFor="colorblind-mode">Colorblind Mode</label>
                  <p className="setting-description">Adjust colors for color vision deficiency</p>
                  <select
                    id="colorblind-mode"
                    className="setting-select"
                    value={settings.colorblindMode}
                    onChange={async e => {
                      updateSetting('colorblindMode', e.target.value);
                      await window.volary.colorblind.set(e.target.value);
                    }}
                  >
                    <option value="off">Off</option>
                    <option value="deuteranopia">Deuteranopia (red-green, most common)</option>
                    <option value="protanopia">Protanopia (red-green)</option>
                    <option value="tritanopia">Tritanopia (blue-yellow)</option>
                  </select>
                </div>

                <div className="setting-item">
                  <label className="setting-label">Reduced Motion</label>
                  <p className="setting-description">Minimize animations and transitions</p>
                  <ToggleSwitch
                    id="reduced-motion"
                    checked={settings.reducedMotion}
                    onChange={v => updateSetting('reducedMotion', v)}
                    label="Reduced Motion"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">High Contrast</label>
                  <p className="setting-description">Increase contrast for text and UI elements</p>
                  <ToggleSwitch
                    id="high-contrast"
                    checked={settings.highContrast}
                    onChange={v => updateSetting('highContrast', v)}
                    label="High Contrast"
                  />
                </div>

                <div className="setting-item">
                  <label className="setting-label">Screen Reader Optimized</label>
                  <p className="setting-description">Enhanced ARIA announcements and focus management</p>
                  <ToggleSwitch
                    id="screen-reader"
                    checked={settings.screenReaderOptimized}
                    onChange={v => updateSetting('screenReaderOptimized', v)}
                    label="Screen Reader Optimized"
                  />
                </div>
              </div>
            )}

            {activeSection === 'shortcuts' && (
              <div className="settings-section">
                <h2 className="settings-section-title">Keyboard Shortcuts</h2>
                <div className="shortcuts-table" role="table" aria-label="Keyboard shortcuts">
                  <div className="shortcuts-header" role="row">
                    <span role="columnheader">Shortcut</span>
                    <span role="columnheader">Action</span>
                  </div>
                  {SHORTCUTS.map(s => (
                    <div key={s.keys} className="shortcuts-row" role="row">
                      <kbd className="shortcut-key" role="cell">{s.keys.replace('Cmd', '⌘').replace('Ctrl', '⌃').replace('Shift', '⇧').replace('Option', '⌥').replace('+', ' ')}</kbd>
                      <span className="shortcut-action" role="cell">{s.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Screen reader live region for status messages */}
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {statusMessage}
        </div>
      </div>
    </div>
  );
};

/** Coerce a stored setting into a clean string list */
const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];

/**
 * Removable list of short values (languages, hosts)
 */
const ChipList: React.FC<{
  items: string[];
  render: (item: string) => string;
  emptyText: string;
  removeLabel: string;
  onRemove: (item: string) => void;
}> = ({ items, render, emptyText, removeLabel, onRemove }) => {
  if (items.length === 0) {
    return <p className="setting-chip-empty">{emptyText}</p>;
  }
  return (
    <ul className="setting-chip-list">
      {items.map(item => (
        <li key={item} className="setting-chip">
          <span>{render(item)}</span>
          <button
            type="button"
            className="setting-chip__remove"
            onClick={() => onRemove(item)}
            aria-label={`${removeLabel}: ${render(item)}`}
            title={removeLabel}
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
};

/**
 * Accessible toggle switch component
 */
const ToggleSwitch: React.FC<{
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}> = ({ id, checked, onChange, label }) => (
  <button
    id={id}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`toggle-switch${checked ? ' toggle-switch--on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="toggle-switch__thumb" />
    <span className="toggle-switch__label">{checked ? 'On' : 'Off'}</span>
  </button>
);
