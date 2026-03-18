import { Search, Sun, Moon, Settings } from 'lucide-react';
import SessionsMenu from './SessionsMenu';
import { useState, useRef, useEffect } from 'react';

interface TopbarProps {
  onSearchOpen: () => void;
  onSettingsOpen?: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  font: 'mono' | 'serif';
  onFontChange: (f: 'mono' | 'serif') => void;
  width: 'standard' | 'narrow';
  onWidthChange: (w: 'standard' | 'narrow') => void;
}

export default function Topbar({ onSearchOpen, onSettingsOpen, theme, onThemeToggle, font, onFontChange, width, onWidthChange }: TopbarProps) {
  const isElectron = !!window.electronAPI?.isElectron;
  const [typoOpen, setTypoOpen] = useState(false);
  const typoRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!typoOpen) return;
    const handler = (e: MouseEvent) => {
      if (typoRef.current && !typoRef.current.contains(e.target as Node)) {
        setTypoOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [typoOpen]);

  return (
    <header className={`topbar${isElectron ? ' topbar-electron' : ''}`}>
      <span className="topbar-wordmark">
        lorien<span className="topbar-wordmark-muted">research</span>
      </span>
      <div className="topbar-spacer" />

      <SessionsMenu />

      <button className="topbar-action topbar-search-action" onClick={onSearchOpen} title="Search (⌃/)">
        <Search size={14} />
        <span className="topbar-search-label">Search…</span>
        <span className="topbar-search-hint">⌃/</span>
      </button>

      <div className="typo-toggle-wrap" ref={typoRef}>
        <button
          className={`topbar-action topbar-font-toggle${typoOpen ? ' is-open' : ''}`}
          onClick={() => setTypoOpen(o => !o)}
          title="Typography settings"
        >
          Aa
        </button>

        {typoOpen && (
          <div className="typo-dropdown">
            <div className="typo-section">
              <div className="typo-section-label">Font</div>
              <div className="typo-btn-group">
                <button
                  className={`typo-btn${font === 'mono' ? ' active' : ''}`}
                  onClick={() => onFontChange('mono')}
                >
                  Mono
                </button>
                <button
                  className={`typo-btn typo-btn-serif${font === 'serif' ? ' active' : ''}`}
                  onClick={() => onFontChange('serif')}
                >
                  Serif
                </button>
              </div>
            </div>

            <div className="typo-divider" />

            <div className="typo-section">
              <div className="typo-section-label">Width</div>
              <div className="typo-btn-group">
                <button
                  className={`typo-btn${width === 'standard' ? ' active' : ''}`}
                  onClick={() => onWidthChange('standard')}
                >
                  Standard
                </button>
                <button
                  className={`typo-btn${width === 'narrow' ? ' active' : ''}`}
                  onClick={() => onWidthChange('narrow')}
                >
                  Narrow
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button className="topbar-action" onClick={onThemeToggle} title="Toggle theme">
        {theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      {window.electronAPI?.isElectron && onSettingsOpen && (
        <button className="topbar-action" onClick={onSettingsOpen} title="Settings">
          <Settings size={14} />
        </button>
      )}
    </header>
  );
}
