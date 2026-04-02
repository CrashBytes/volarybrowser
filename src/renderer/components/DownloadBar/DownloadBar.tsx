import React from 'react';
import { useBrowserStore } from '../../store/browser-store';
import './DownloadBar.css';

export const DownloadBar: React.FC = () => {
  const downloads = useBrowserStore((s) => s.downloads);

  const active = downloads.filter(d => d.state === 'progressing' || d.state === 'interrupted');
  if (active.length === 0) return null;

  return (
    <div className="download-bar">
      {active.map(dl => {
        const percent = dl.totalBytes > 0
          ? Math.round((dl.receivedBytes / dl.totalBytes) * 100)
          : 0;

        return (
          <div key={dl.id} className="download-item">
            <span className="download-item__name" title={dl.filename}>
              {dl.filename.length > 25 ? dl.filename.slice(0, 22) + '...' : dl.filename}
            </span>
            <div className="download-item__progress">
              <div className="download-item__bar" style={{ width: `${percent}%` }} />
            </div>
            <span className="download-item__percent">{percent}%</span>
            <button
              className="download-item__btn"
              onClick={() => window.volary.downloads.cancel(dl.id)}
              title="Cancel"
              aria-label="Cancel download"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
};
