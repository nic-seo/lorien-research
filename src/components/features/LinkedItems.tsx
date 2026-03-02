import { useState, useRef, useEffect } from 'react';
import { Link as LinkIcon, X, ArrowRight } from 'lucide-react';
import { useLinks, useProjectDocs, type ResolvedLink } from '../../db/hooks';
import { createLink, deleteDoc } from '../../db';
import { usePanelNavigate } from '../../panels/usePanelNavigate';
import type { DocType, Report, Note, Chat, Reference } from '../../db/types';

const TYPE_LABELS: Record<string, string> = {
  report: 'Report',
  note: 'Note',
  chat: 'Chat',
  reference: 'Ref',
};

const TYPE_COLORS: Record<string, string> = {
  report: 'pink',
  note: 'green',
  chat: 'blue',
  reference: 'yellow',
};

function getDocPath(link: ResolvedLink): string | null {
  switch (link.docType) {
    case 'report':
      return link.projectId ? `/project/${link.projectId}/report/${link.docId}` : null;
    case 'chat':
      return link.projectId ? `/project/${link.projectId}/chat/${link.docId}` : null;
    case 'note':
      return link.projectId ? `/project/${link.projectId}?tab=notes` : null;
    case 'reference':
      return link.projectId ? `/project/${link.projectId}?tab=references` : null;
    default:
      return null;
  }
}

interface LinkableDoc {
  id: string;
  type: DocType;
  title: string;
}

interface LinkedItemsProps {
  docId: string;
  docType: DocType;
  projectId: string;
}

export default function LinkedItems({ docId, docType, projectId }: LinkedItemsProps) {
  const { links } = useLinks(docId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelNavigate = usePanelNavigate();

  const { docs: reports } = useProjectDocs<Report>('report', projectId);
  const { docs: notes } = useProjectDocs<Note>('note', projectId);
  const { docs: chats } = useProjectDocs<Chat>('chat', projectId);
  const { docs: refs } = useProjectDocs<Reference>('reference', projectId);

  const hasLinks = links.length > 0;

  const allDocs: LinkableDoc[] = [
    ...reports.map(r => ({ id: r._id, type: 'report' as DocType, title: r.title })),
    ...notes.map(n => ({ id: n._id, type: 'note' as DocType, title: n.title })),
    ...chats.map(c => ({ id: c._id, type: 'chat' as DocType, title: c.title })),
    ...refs.map(r => ({ id: r._id, type: 'reference' as DocType, title: r.title })),
  ];

  const existingIds = new Set(links.map(l => l.docId));
  const q = query.toLowerCase().trim();
  const filtered = allDocs.filter(d => {
    if (d.id === docId) return false;
    if (existingIds.has(d.id)) return false;
    if (!q) return true;
    return d.title.toLowerCase().includes(q) || d.type.includes(q);
  });

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else setQuery('');
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRemove = async (e: React.MouseEvent, linkId: string) => {
    e.stopPropagation();
    await deleteDoc(linkId);
  };

  const handleNavigate = (e: React.MouseEvent, link: ResolvedLink) => {
    const path = getDocPath(link);
    if (path) { panelNavigate(path, e); setOpen(false); }
  };

  const handleSelect = async (target: LinkableDoc) => {
    await createLink(docId, docType, target.id, target.type);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="linked-items" ref={containerRef}>
      <button
        className={`linked-items-btn ${hasLinks ? 'has-links' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title={hasLinks ? `${links.length} linked item${links.length !== 1 ? 's' : ''}` : 'Add link'}
      >
        <LinkIcon size={13} />
        {hasLinks && <span className="linked-items-count">{links.length}</span>}
      </button>

      {open && (
        <div className="linked-items-dropdown">
          {/* Active links */}
          {links.length > 0 && (
            <div className="linked-items-active">
              {links.map(link => {
                const path = getDocPath(link);
                return (
                  <div key={link.linkId} className="linked-items-row">
                    <span className={`linked-chip-type badge-${TYPE_COLORS[link.docType] || 'blue'}`}>
                      {TYPE_LABELS[link.docType] || link.docType}
                    </span>
                    <span className="linked-items-row-title">{link.title}</span>
                    {path && (
                      <button
                        className="linked-items-row-nav"
                        onClick={e => handleNavigate(e, link)}
                        title="Go to"
                      >
                        <ArrowRight size={11} />
                      </button>
                    )}
                    <button
                      className="linked-items-row-remove"
                      onClick={e => handleRemove(e, link.linkId)}
                      title="Remove link"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search + add */}
          <div className={`linked-items-search ${links.length > 0 ? 'has-divider' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              className="linked-items-input"
              placeholder="Search to link…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && filtered.length > 0) handleSelect(filtered[0]);
              }}
            />
            <div className="linked-items-results">
              {filtered.length === 0 && (
                <div className="linked-items-empty">
                  {q ? 'No matches' : allDocs.length === 0 ? 'No docs in project' : 'All docs linked'}
                </div>
              )}
              {filtered.slice(0, 8).map(d => (
                <button
                  key={d.id}
                  className="linked-items-result-item"
                  onClick={() => handleSelect(d)}
                >
                  <span className={`linked-chip-type badge-${TYPE_COLORS[d.type] || 'blue'}`}>
                    {TYPE_LABELS[d.type] || d.type}
                  </span>
                  <span className="linked-items-row-title">{d.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
