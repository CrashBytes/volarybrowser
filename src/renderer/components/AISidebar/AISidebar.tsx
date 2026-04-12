import React, { useState, useRef, useEffect } from 'react';
import './AISidebar.css';

interface AISidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export const AISidebar: React.FC<AISidebarProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [model, setModel] = useState('llama3.1');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Load saved Ollama settings
  useEffect(() => {
    if (!window.volary) return;
    window.volary.settings.getAll().then((all: any) => {
      if (all.ollamaUrl) setOllamaUrl(all.ollamaUrl as string);
      if (all.ollamaModel) setModel(all.ollamaModel as string);
    }).catch(() => {});
  }, []);

  const saveSettings = async (url: string, mdl: string) => {
    try {
      await window.volary.settings.set('ollamaUrl', url);
      await window.volary.settings.set('ollamaModel', mdl);
    } catch { /* ignore */ }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: updated,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const data = await response.json();
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.message?.content || 'No response',
      };
      setMessages([...updated, assistantMsg]);
    } catch (err) {
      setError(
        `Cannot reach Ollama at ${ollamaUrl}. Make sure Ollama is running and accessible.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-sidebar">
      <div className="ai-sidebar__header">
        <span className="ai-sidebar__title">AI Assistant</span>
        <div className="ai-sidebar__header-actions">
          <button
            className="ai-sidebar__settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Configure Ollama"
          >
            {showSettings ? 'Chat' : 'Settings'}
          </button>
          <button
            className="ai-sidebar__close"
            onClick={onClose}
            aria-label="Close AI sidebar"
          >
            &times;
          </button>
        </div>
      </div>

      {showSettings ? (
        <div className="ai-sidebar__settings">
          <div className="ai-sidebar__setting">
            <label className="ai-sidebar__label">Ollama Server URL</label>
            <input
              type="text"
              className="ai-sidebar__input"
              value={ollamaUrl}
              onChange={e => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
            />
          </div>
          <div className="ai-sidebar__setting">
            <label className="ai-sidebar__label">Model</label>
            <input
              type="text"
              className="ai-sidebar__input"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="llama3.1"
            />
          </div>
          <button
            className="ai-sidebar__save-btn"
            onClick={() => {
              saveSettings(ollamaUrl, model);
              setShowSettings(false);
            }}
          >
            Save
          </button>
          <p className="ai-sidebar__hint">
            Install Ollama on your server: curl -fsSL https://ollama.ai/install.sh | sh
          </p>
        </div>
      ) : (
        <>
          <div className="ai-sidebar__messages">
            {messages.length === 0 && !error && (
              <div className="ai-sidebar__empty">
                <p>Ask anything. Runs on your own Ollama server — fully private, no censorship.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-sidebar__msg ai-sidebar__msg--${msg.role}`}>
                <div className="ai-sidebar__msg-content">{msg.content}</div>
              </div>
            ))}
            {isLoading && (
              <div className="ai-sidebar__msg ai-sidebar__msg--assistant">
                <div className="ai-sidebar__msg-content ai-sidebar__typing">Thinking...</div>
              </div>
            )}
            {error && (
              <div className="ai-sidebar__error">{error}</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-sidebar__input-area">
            <textarea
              ref={inputRef}
              className="ai-sidebar__textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={2}
              disabled={isLoading}
            />
            <button
              className="ai-sidebar__send"
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
};
