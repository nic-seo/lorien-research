import { Search, Sun, Moon, Settings } from 'lucide-react';
import SessionsMenu from './SessionsMenu';

interface TopbarProps {
  onSearchOpen: () => void;
  onSettingsOpen?: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  font: 'mono' | 'serif';
  onFontToggle: () => void;
}

export default function Topbar({ onSearchOpen, onSettingsOpen, theme, onThemeToggle, font, onFontToggle }: TopbarProps) {
  const isElectron = !!window.electronAPI?.isElectron;

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

      <button className="topbar-action topbar-font-toggle" onClick={onFontToggle} title={`Switch to ${font === 'mono' ? 'serif' : 'mono'}`}>
        {font === 'mono' ? 'Aa' : 'Ff'}
      </button>

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
