import { useState, useRef, useEffect } from 'react';
import { X, Link as LinkIcon } from 'lucide-react';
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
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="linked-items">
      <div className="linked-items-row">
        {links.map((link, i) => (
          <LinkedChip key={link.linkId} link={link} showDivider={i > 0} />
        ))}
        <button
          className="linked-items-add"
          onClick={() => setPickerOpen(prev => !prev)}
          title="Add link"
        >
          <LinkIcon size={12} />
        </button>
      </div>

      {pickerOpen && (
        <LinkPicker
          docId={docId}
          docType={docType}
          projectId={projectId}
          existingLinks={links}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function LinkedChip({ link, showDivider }: { link: ResolvedLink; showDivider: boolean }) {
  const panelNavigate = usePanelNavigate();
  const path = getDocPath(link);

  const handleClick = (e: React.MouseEvent) => {
    if (path) panelNavigate(path, e);
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteDoc(link.linkId);
  };

  return (
    <>
      {showDivider && <span className="linked-chip-divider" />}
      <div className="linked-chip" onClick={handleClick} title={`${TYPE_LABELS[link.docType] || link.docType}: ${link.title}`}>
        <span className={`linked-chip-type badge-${TYPE_COLORS[link.docType] || 'blue'}`}>
          {TYPE_LABELS[link.docType] || link.docType}
        </span>
        <span className="linked-chip-title">{link.title}</span>
        <button className="linked-chip-remove" onClick={handleRemove} title="Remove link">
          <X size={10} />
        </button>
      </div>
    </>
  );
}

function LinkPicker({
  docId,
  docType,
  projectId,
  existingLinks,
  onClose,
}: {
  docId: string;
  docType: DocType;
  projectId: string;
  existingLinks: ResolvedLink[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { docs: reports } = useProjectDocs<Report>('report', projectId);
  const { docs: notes } = useProjectDocs<Note>('note', projectId);
  const { docs: chats } = useProjectDocs<Chat>('chat', projectId);
  const { docs: refs } = useProjectDocs<Reference>('reference', projectId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const existingIds = new Set(existingLinks.map(l => l.docId));

  // Build flat list of project-scoped linkable docs
  const allDocs: LinkableDoc[] = [
    ...reports.map(r => ({ id: r._id, type: 'report' as DocType, title: r.title })),
    ...notes.map(n => ({ id: n._id, type: 'note' as DocType, title: n.title })),
    ...chats.map(c => ({ id: c._id, type: 'chat' as DocType, title: c.title })),
    ...refs.map(r => ({ id: r._id, type: 'reference' as DocType, title: r.title })),
  ];

  const q = query.toLowerCase().trim();
  const filtered = allDocs.filter(d => {
    if (d.id === docId) return false; // can't link to self
    if (existingIds.has(d.id)) return false; // already linked
    if (!q) return true;
    return d.title.toLowerCase().includes(q) || d.type.includes(q);
  });

  const handleSelect = async (target: LinkableDoc) => {
    await createLink(docId, docType, target.id, target.type);
    onClose();
  };

  return (
    <div className="link-picker">
      <input
        ref={inputRef}
        type="text"
        className="link-picker-input"
        placeholder="Search to link…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && filtered.length > 0) handleSelect(filtered[0]);
        }}
      />
      <div className="link-picker-results">
        {filtered.length === 0 && (
          <div className="link-picker-empty">No matches</div>
        )}
        {filtered.slice(0, 8).map(d => (
          <button
            key={d.id}
            className="link-picker-item"
            onClick={() => handleSelect(d)}
          >
            <span className={`linked-chip-type badge-${TYPE_COLORS[d.type] || 'blue'}`}>
              {TYPE_LABELS[d.type] || d.type}
            </span>
            <span className="link-picker-item-title">{d.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
