import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import { Layers } from 'lucide-react';
import { usePanels } from '../../panels/PanelContext';

interface SavedSession {
  id: string;
  name: string;
  paths: string[];
  savedAt: string;
}

const SESSIONS_KEY = 'lorien-sessions';
const ACTIVE_SESSION_KEY = 'lorien-active-session';

const isElectron = !!window.electronAPI?.loadSessions;

function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch { return []; }
}

function storeSessions(sessions: SavedSession[]) {
  const json = JSON.stringify(sessions);
  try { localStorage.setItem(SESSIONS_KEY, json); } catch {}
  if (isElectron) window.electronAPI!.saveSessions(json);
}

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

function storeActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id);
  else localStorage.removeItem(ACTIVE_SESSION_KEY);
}

export default function SessionsMenu() {
  const { getCurrentPaths, loadSession } = usePanels();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());

  // On mount in Electron, load from file (overrides localStorage which may be stale)
  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI!.loadSessions().then(json => {
      try {
        const loaded = JSON.parse(json) as SavedSession[];
        if (loaded.length > 0) {
          setSessions(loaded);
          localStorage.setItem(SESSIONS_KEY, json);
        }
      } catch {}
    });
  }, []);
  const [nameInput, setNameInput] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Pre-fill name input when dropdown opens
  useEffect(() => {
    if (!open) return;
    const active = sessions.find(s => s.id === activeId);
    setNameInput(active?.name ?? '');
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSession = () => {
    const name = nameInput.trim();
    if (!name) return;
    const paths = getCurrentPaths();
    const now = new Date().toISOString();

    // Overwrite if a session with this exact name already exists, otherwise create new
    let updated: SavedSession[];
    const existing = sessions.find(s => s.name.toLowerCase() === name.toLowerCase());
    let savedId: string;

    if (existing) {
      updated = sessions.map(s => s.id === existing.id ? { ...s, paths, savedAt: now } : s);
      savedId = existing.id;
    } else {
      const newSession: SavedSession = { id: crypto.randomUUID(), name, paths, savedAt: now };
      updated = [newSession, ...sessions];
      savedId = newSession.id;
    }

    setSessions(updated);
    storeSessions(updated);
    setActiveId(savedId);
    storeActiveId(savedId);
    setOpen(false);
  };

  const loadSavedSession = (session: SavedSession) => {
    loadSession(session.paths);
    setActiveId(session.id);
    storeActiveId(session.id);
    setOpen(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    storeSessions(updated);
    if (activeId === id) {
      setActiveId(null);
      storeActiveId(null);
    }
  };

  const activeSession = sessions.find(s => s.id === activeId);

  return (
    <div className="sessions-menu" ref={menuRef}>
      <button
        className={`topbar-action sessions-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title="Sessions"
      >
        <Layers size={12} />
        <span className="sessions-label">{activeSession?.name ?? 'Sessions'}</span>
      </button>

      {open && (
        <div className="sessions-dropdown">
          {/* Save row */}
          <div className="sessions-save-row">
            <input
              ref={inputRef}
              type="text"
              className="sessions-name-input"
              placeholder="Name this session…"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveSession();
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            <button
              className="sessions-save-btn"
              onClick={saveSession}
              disabled={!nameInput.trim()}
            >
              Save
            </button>
          </div>

          {/* Saved sessions list */}
          {sessions.length > 0 && (
            <>
              <div className="sessions-divider" />
              <div className="sessions-list">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className={`sessions-item ${session.id === activeId ? 'active' : ''}`}
                    onClick={() => loadSavedSession(session)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && loadSavedSession(session)}
                  >
                    <span className="sessions-item-name">{session.name}</span>
                    <span className="sessions-item-meta">{session.paths.length}</span>
                    <button
                      className="sessions-item-delete"
                      onClick={e => deleteSession(session.id, e)}
                      title="Delete session"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {sessions.length === 0 && (
            <div className="sessions-empty">No saved sessions yet</div>
          )}
        </div>
      )}
    </div>
  );
}
