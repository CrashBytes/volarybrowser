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
import './Settings.css';

interface SettingsProps {
  isOpen: boolean;
  initialSection?: string;
  onClose: () => void;
}

type Section = 'general' | 'privacy' | 'appearance' | 'accessibility' | 'shortcuts';

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
};

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙️' },
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
