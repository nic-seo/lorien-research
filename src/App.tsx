import { Routes, Route } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import SearchOverlay from './components/layout/SearchOverlay';
import Overview from './pages/Overview';
import ProjectDetail from './pages/ProjectDetail';
import ReportView from './pages/ReportView';
import NoteView from './pages/NoteView';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 900);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // Cmd+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close sidebar on mobile when navigating
  const handleNavigation = useCallback(() => {
    if (window.innerWidth <= 900) {
      setSidebarOpen(false);
    }
  }, []);

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onNavigate={handleNavigation} />
      <div className="main">
        <Topbar
          onMenuToggle={() => setSidebarOpen(prev => !prev)}
          onSearchOpen={() => setSearchOpen(true)}
          theme={theme}
          onThemeToggle={toggleTheme}
        />
        <div className="content">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/project/:projectId" element={<ProjectDetail />} />
            <Route path="/report/:reportId" element={<ReportView />} />
            <Route path="/note/:noteId" element={<NoteView />} />
          </Routes>
        </div>
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
