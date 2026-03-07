import SessionsMenu from './SessionsMenu';

interface TopbarProps {
  onSearchOpen: () => void;
  onSettingsOpen?: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

export default function Topbar({ onSearchOpen, onSettingsOpen, theme, onThemeToggle }: TopbarProps) {
  return (
    <header className="topbar">
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
