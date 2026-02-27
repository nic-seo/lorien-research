import { useState, useEffect, useRef } from 'react';
import { usePanels } from '../../panels/PanelContext';
import { useDocs } from '../../db/hooks';
import type { Project, Report, Note } from '../../db/types';

interface SearchOverlayProps {
  onClose: () => void;
}

interface SearchResult {
  id: string;
  title: string;
  type: string;
  path: string;
}

export default function SearchOverlay({ onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { navigatePanel } = usePanels();

  const { docs: projects } = useDocs<Project>('project');
  const { docs: reports } = useDocs<Report>('report');
  const { docs: notes } = useDocs<Note>('note');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results: SearchResult[] = [];
  const q = query.toLowerCase().trim();

  if (q) {
    projects.forEach(p => {
      if (p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) {
        results.push({ id: p._id, title: p.title, type: 'Project', path: `/project/${p._id}` });
      }
    });
    reports.forEach(r => {
      if (r.title.toLowerCase().includes(q) || r.sourceQuery.toLowerCase().includes(q)) {
        results.push({ id: r._id, title: r.title, type: 'Report', path: `/project/${r.projectId}/report/${r._id}` });
      }
    });
    notes.forEach(n => {
      if (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)) {
        results.push({
          id: n._id,
          title: n.title,
          type: 'Note',
          path: n.projectId ? `/project/${n.projectId}` : '/',
        });
      }
    });
  }

  const goTo = (path: string) => {
    navigatePanel(path);
    onClose();
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search projects, reports, notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && results.length > 0) goTo(results[0].path);
          }}
        />

        {q && (
          <div className="search-results">
            {results.length === 0 ? (
              <div className="search-empty">No results for "{query}"</div>
            ) : (
              results.slice(0, 10).map(result => (
                <button
                  key={result.id}
                  className="search-result-item"
                  onClick={() => goTo(result.path)}
                >
                  <span className={`badge badge-${result.type.toLowerCase()}`}>
                    {result.type}
                  </span>
                  <span>{result.title}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
