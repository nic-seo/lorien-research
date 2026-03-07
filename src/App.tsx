import { useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import Topbar from './components/layout/Topbar';
import SearchOverlay from './components/layout/SearchOverlay';
import QuickAddOverlay from './components/layout/QuickAddOverlay';
import QuickLookupOverlay from './components/layout/QuickLookupOverlay';
import PanelShell from './panels/PanelShell';
import { PanelProvider, usePanels } from './panels/PanelContext';
import { useExternalLinkInterceptor } from './hooks/useExternalLinkInterceptor';

export default function App() {
  const location = useLocation();
  const initialPath = location.pathname + location.search;

  return (
    <PanelProvider initialPath={initialPath}>
      <AppLayout />
    </PanelProvider>
  );
}

function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const contentAreaRef = useRef<HTMLDivElement>(null);

  const { panels, addPanel, getFirstPanelPath } = usePanels();

  useExternalLinkInterceptor(contentAreaRef);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // Keyboard shortcuts: Cmd+K search, Ctrl+P new panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        setQueueOpen(prev => !prev);
      }
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setLookupOpen(prev => !prev);
      }
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        // Open new panel at current project, or overview if not on a project page
        const currentPath = getFirstPanelPath();
        const projectMatch = currentPath.match(/^\/project\/([^/]+)/);
        addPanel(projectMatch ? `/project/${projectMatch[1]}` : '/');
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setQueueOpen(false);
        setLookupOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addPanel, getFirstPanelPath]);

  return (
    <div className="app-layout">
      <div className="main">
        <Topbar
          onSearchOpen={() => setSearchOpen(true)}
          theme={theme}
          onThemeToggle={toggleTheme}
        />
        <div className="content-area" ref={contentAreaRef}>
          {panels.map(panel => (
            <PanelShell key={panel.id} panel={panel} />
          ))}
        </div>
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
      {queueOpen && <QuickAddOverlay onClose={() => setQueueOpen(false)} />}
      {lookupOpen && <QuickLookupOverlay onClose={() => setLookupOpen(false)} />}
    </div>
  );
}
