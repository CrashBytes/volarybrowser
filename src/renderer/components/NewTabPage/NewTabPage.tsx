import React, { useState, useEffect } from 'react';
import './NewTabPage.css';

interface HistoryEntry {
  url: string;
  title: string;
  visitTime: number;
}

export const NewTabPage: React.FC = () => {
  const [recentSites, setRecentSites] = useState<HistoryEntry[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    // Set greeting based on time of day
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    // Load recent history
    loadRecentSites();
  }, []);

  const loadRecentSites = async () => {
    try {
      const history = await window.volary.history.getRecent(50);
      // Deduplicate by domain and take top 8
      const seen = new Set<string>();
      const unique: HistoryEntry[] = [];
      for (const entry of history) {
        try {
          const domain = new URL(entry.url).hostname;
          if (!seen.has(domain)) {
            seen.add(domain);
            unique.push(entry);
          }
        } catch { /* skip bad URLs */ }
        if (unique.length >= 8) break;
      }
      setRecentSites(unique);
    } catch {
      // History not available yet
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;
    window.volary.navigation.navigateTo(searchValue);
  };

  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).origin;
      return `${domain}/favicon.ico`;
    } catch {
      return '';
    }
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <div className="new-tab-page">
      <div className="ntp-content">
        <h1 className="ntp-greeting">{greeting}</h1>

        <form className="ntp-search" onSubmit={handleSearch}>
          <input
            type="text"
            className="ntp-search__input"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search or enter URL..."
            autoFocus
          />
        </form>

        {recentSites.length > 0 && (
          <div className="ntp-sites">
            <h2 className="ntp-section-title">Frequently Visited</h2>
            <div className="ntp-sites-grid">
              {recentSites.map((site, i) => (
                <button
                  key={i}
                  className="ntp-site-card"
                  onClick={() => window.volary.navigation.navigateTo(site.url)}
                  title={site.title || site.url}
                >
                  <div className="ntp-site-icon">
                    <img
                      src={getFavicon(site.url)}
                      alt=""
                      width="24"
                      height="24"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="ntp-site-fallback">
                      {getDomain(site.url).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="ntp-site-name">{getDomain(site.url)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
