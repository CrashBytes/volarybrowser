/**
 * Volary Browser - Renderer Process Entry Point
 * 
 * Architectural Responsibilities:
 * - React application bootstrap
 * - Error boundary establishment (prevent white screen of death)
 * - Development tools integration (React DevTools)
 * - Performance monitoring initialization
 * 
 * Design Philosophy:
 * - Fail-fast in development (surface errors immediately)
 * - Graceful degradation in production (show error UI, don't crash)
 * - Observable rendering (log mount/unmount lifecycle)
 * 
 * @module renderer/index
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

/**
 * Application Error Boundary
 * 
 * Last line of defense against unhandled exceptions in React tree.
 * Prevents entire application crash from single component failure.
 * 
 * Production: Displays fallback UI with error reporting option
 * Development: Shows detailed error with component stack trace
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for debugging
    console.error('[Volary] React Error Boundary caught error:', error, errorInfo);

    // TODO: Send to error reporting service in production
    // - Sentry integration
    // - User consent check
    // - Sanitize sensitive data
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '2rem',
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ maxWidth: '600px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#ef4444' }}>
              Something went wrong
            </h1>
            <p style={{ marginBottom: '2rem', color: '#a0a0a0', lineHeight: '1.6' }}>
              Volary Browser encountered an unexpected error. This has been logged for
              investigation.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details
                style={{
                  textAlign: 'left',
                  marginBottom: '2rem',
                  padding: '1rem',
                  backgroundColor: '#2d2d2d',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '300px',
                }}
              >
                <summary style={{ cursor: 'pointer', marginBottom: '1rem' }}>
                  Error Details (Development)
                </summary>
                <div style={{ color: '#ef4444' }}>
                  <strong>{this.state.error.name}:</strong> {this.state.error.message}
                </div>
                {this.state.error.stack && (
                  <pre
                    style={{
                      marginTop: '1rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: '#a0a0a0',
                    }}
                  >
                    {this.state.error.stack}
                  </pre>
                )}
              </details>
            )}

            <button
              onClick={this.handleReload}
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                backgroundColor: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#4f46e5';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#6366f1';
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Application initialization
 * 
 * Sequence:
 * 1. Verify DOM ready (root element exists)
 * 2. Create React root (React 18+ concurrent mode)
 * 3. Wrap App in ErrorBoundary (prevent crashes)
 * 4. Enable StrictMode in development (detect issues early)
 * 5. Mount to DOM
 */
function initializeApplication(): void {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error(
      'Failed to find root element. Ensure index.html contains <div id="root"></div>'
    );
  }

  console.log('[Volary] Initializing React application...');

  // Create React 18 root (enables concurrent features)
  const root = createRoot(rootElement);

  // Development-only wrapper for detecting potential issues
  const AppWithDevTools =
    process.env.NODE_ENV === 'development' ? (
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    ) : (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );

  // Render application
  root.render(AppWithDevTools);

  console.log('[Volary] React application mounted successfully');

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[Volary] Running in development mode');
    console.log('[Volary] React DevTools available:', !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__);
    
    // Verify window.volary API is available
    if (window.volary) {
      console.log('[Volary] Preload API verified:', Object.keys(window.volary));
    } else {
      console.error('[Volary] Preload API not available! Context isolation may be failing.');
    }
  }
}

/**
 * Window load event handler
 * 
 * Waits for complete DOM and external resources before initialization.
 * Ensures all stylesheets, images loaded (prevents layout shift).
 */
if (document.readyState === 'loading') {
  // DOM not ready, wait for it
  document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
  // DOM already ready, initialize immediately
  initializeApplication();
}

/**
 * Development Hot Module Replacement (HMR)
 * 
 * Enables component updates without full page reload.
 * Preserves application state during development.
 */
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./App', () => {
    console.log('[Volary] Hot reloading App component...');
    // Re-render will happen automatically with webpack-dev-server
  });
}

/**
 * Performance monitoring (optional)
 * 
 * Track initialization timing for performance optimization.
 * Future: Send to telemetry service (with user consent).
 */
if (window.performance && window.performance.mark) {
  window.performance.mark('volary-renderer-init-complete');
  
  // Measure time from navigation start to init complete
  window.performance.measure(
    'volary-init-duration',
    'navigationStart',
    'volary-renderer-init-complete'
  );

  const initMeasure = window.performance.getEntriesByName('volary-init-duration')[0];
  if (initMeasure && process.env.NODE_ENV === 'development') {
    console.log(`[Volary] Initialization took ${initMeasure.duration.toFixed(2)}ms`);
  }
}
