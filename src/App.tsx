import { useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import Topbar from './components/layout/Topbar';
import SearchOverlay from './components/layout/SearchOverlay';
import QuickAddOverlay from './components/layout/QuickAddOverlay';
import QuickLookupOverlay from './components/layout/QuickLookupOverlay';
import SettingsOverlay from './components/layout/SettingsOverlay';
import OnboardingOverlay from './components/layout/OnboardingOverlay';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const contentAreaRef = useRef<HTMLDivElement>(null);

  const { panels, addPanel, getFirstPanelPath } = usePanels();

  useExternalLinkInterceptor(contentAreaRef);

  // Check if running in Electron and needs API key setup
  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      window.electronAPI.hasApiKeys().then(has => {
        setNeedsOnboarding(!has);
      });
    }
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // Keyboard shortcuts: Ctrl+/ search, Ctrl+. lookup, Ctrl+P new panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Slash') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.ctrlKey && e.code === 'KeyQ') {
        e.preventDefault();
        setQueueOpen(prev => !prev);
      }
      if (e.ctrlKey && e.code === 'Period') {
        e.preventDefault();
        setLookupOpen(prev => !prev);
      }
      if (e.ctrlKey && e.code === 'KeyP') {
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
          onSettingsOpen={() => setSettingsOpen(true)}
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
      {settingsOpen && <SettingsOverlay onClose={() => setSettingsOpen(false)} />}
      {needsOnboarding && (
        <OnboardingOverlay onComplete={() => setNeedsOnboarding(false)} />
      )}
    </div>
  );
}
