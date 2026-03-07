import SessionsMenu from './SessionsMenu';

interface TopbarProps {
  onSearchOpen: () => void;
  onSettingsOpen?: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

export default function Topbar({ onSearchOpen, onSettingsOpen, theme, onThemeToggle }: TopbarProps) {
  const isElectron = !!window.electronAPI?.isElectron;

  return (
    <header className={`topbar${isElectron ? ' topbar-electron' : ''}`}>
      <span className="topbar-wordmark">
        lorien<span className="topbar-wordmark-muted">research</span>
      </span>
      <div className="topbar-spacer" />

      <SessionsMenu />

      <button className="topbar-action" onClick={onSearchOpen} title="Search (⌘K)">
        <span>⌕</span>
        <span className="topbar-search-hint">Search… ⌘K</span>
      </button>

      <button className="topbar-action" onClick={onThemeToggle} title="Toggle theme">
        {theme === 'light' ? '◐' : '◑'}
      </button>

      {window.electronAPI?.isElectron && onSettingsOpen && (
        <button className="topbar-action" onClick={onSettingsOpen} title="Settings">
          ⚙
        </button>
      )}
    </header>
  );
}
