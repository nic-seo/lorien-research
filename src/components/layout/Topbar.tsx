interface TopbarProps {
  onMenuToggle: () => void;
  onSearchOpen: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

export default function Topbar({ onMenuToggle, onSearchOpen, theme, onThemeToggle }: TopbarProps) {
  return (
    <header className="topbar">
      <button className="topbar-menu-btn" onClick={onMenuToggle} title="Toggle sidebar">
        ☰
      </button>

      <div className="topbar-spacer" />

      <button className="topbar-action" onClick={onSearchOpen} title="Search (⌘K)">
        <span>⌕</span>
        <span className="topbar-search-hint">Search… ⌘K</span>
      </button>

      <button className="topbar-action" onClick={onThemeToggle} title="Toggle theme">
        {theme === 'light' ? '◐' : '◑'}
      </button>
    </header>
  );
}
