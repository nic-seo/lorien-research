import { useState, useEffect, useRef } from 'react';
import { usePanels } from '../../panels/PanelContext';
import { useDocs, useProjectDocs } from '../../db/hooks';
import { createDoc } from '../../db/index';
import type { Project, Report, Note, Chat, Reference, QueueItem, QueueItemType } from '../../db/types';

interface QuickAddOverlayProps {
  onClose: () => void;
}

const TYPES: { key: QueueItemType; emoji: string; label: string }[] = [
  { key: 'read', emoji: '📖', label: 'Read' },
  { key: 'watch', emoji: '🎬', label: 'Watch' },
  { key: 'question', emoji: '❓', label: 'Question' },
  { key: 'todo', emoji: '✓', label: 'Todo' },
];

interface LinkableDoc {
  id: string;
  title: string;
  kind: string;
}

export default function QuickAddOverlay({ onClose }: QuickAddOverlayProps) {
  const { getFirstPanelPath } = usePanels();
  const { docs: projects } = useDocs<Project>('project');

  // Auto-detect project from URL
  const currentPath = getFirstPanelPath();
  const projectMatch = currentPath.match(/^\/project\/([^/]+)/);
  const detectedProjectId = projectMatch ? projectMatch[1] : null;

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(detectedProjectId);
  const [itemType, setItemType] = useState<QueueItemType>('todo');
  const [text, setText] = useState('');
  const [addedFlash, setAddedFlash] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkFilter, setLinkFilter] = useState('');
  const [linkedDocId, setLinkedDocId] = useState<string | null>(null);
  const [linkedDocTitle, setLinkedDocTitle] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const linkFilterRef = useRef<HTMLInputElement>(null);

  // Fetch project docs for the link picker
  const { docs: reports } = useProjectDocs<Report>('report', selectedProjectId);
  const { docs: notes } = useProjectDocs<Note>('note', selectedProjectId);
  const { docs: chats } = useProjectDocs<Chat>('chat', selectedProjectId);
  const { docs: refs } = useProjectDocs<Reference>('reference', selectedProjectId);

  const linkableDocs: LinkableDoc[] = [
    ...reports.map(d => ({ id: d._id, title: d.title, kind: 'Report' })),
    ...notes.map(d => ({ id: d._id, title: d.title, kind: 'Note' })),
    ...chats.map(d => ({ id: d._id, title: d.title, kind: 'Chat' })),
    ...refs.map(d => ({ id: d._id, title: d.title, kind: 'Reference' })),
  ];

  const filteredDocs = linkFilter.trim()
    ? linkableDocs.filter(d =>
        d.title.toLowerCase().includes(linkFilter.toLowerCase()) ||
        d.kind.toLowerCase().includes(linkFilter.toLowerCase()),
      )
    : linkableDocs;

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Focus link filter when picker opens
  useEffect(() => {
    if (linkPickerOpen) linkFilterRef.current?.focus();
  }, [linkPickerOpen]);

  // Find project name
  const selectedProject = projects.find(p => p._id === selectedProjectId);

  const addItem = async () => {
    if (!text.trim() || !selectedProjectId) return;
    await createDoc<QueueItem>('queue-item', {
      projectId: selectedProjectId,
      text: text.trim(),
      itemType,
      linkedDocId: linkedDocId,
      status: 'open',
      priority: 0,
    });
    setText('');
    setLinkedDocId(null);
    setLinkedDocTitle(null);
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1200);
    inputRef.current?.focus();
  };

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setLinkedDocId(null);
    setLinkedDocTitle(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const selectLinkedDoc = (doc: LinkableDoc) => {
    setLinkedDocId(doc.id);
    setLinkedDocTitle(`${doc.kind}: ${doc.title}`);
    setLinkPickerOpen(false);
    setLinkFilter('');
    inputRef.current?.focus();
  };

  const clearLink = () => {
    setLinkedDocId(null);
    setLinkedDocTitle(null);
    inputRef.current?.focus();
  };

  // Project picker view
  if (!selectedProjectId) {
    return (
      <div className="queue-overlay" onClick={onClose}>
        <div className="queue-modal" onClick={e => e.stopPropagation()}>
          <div className="queue-modal-header">
            <span className="queue-project-label">Pick a project</span>
          </div>
          <div className="queue-project-list">
            {projects.map(p => (
              <button
                key={p._id}
                className="queue-project-item"
                onClick={() => selectProject(p._id)}
              >
                {p.title}
              </button>
            ))}
            {projects.length === 0 && (
              <div className="queue-empty">No projects yet</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="queue-overlay" onClick={onClose}>
      <div className="queue-modal" onClick={e => e.stopPropagation()}>
        {/* Header: project name + type selector */}
        <div className="queue-modal-header">
          <button
            className="queue-project-label clickable"
            onClick={() => { setSelectedProjectId(null); }}
            title="Change project"
          >
            {selectedProject?.title ?? 'Unknown project'}
          </button>
          <div className="queue-type-group">
            {TYPES.map(t => (
              <button
                key={t.key}
                className={`queue-type-btn ${itemType === t.key ? 'active' : ''}`}
                onClick={() => setItemType(t.key)}
                title={t.label}
              >
                {t.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Text input */}
        <div className="queue-input-row">
          <input
            ref={inputRef}
            type="text"
            className="queue-input"
            placeholder="Add to queue…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                if (linkPickerOpen) setLinkPickerOpen(false);
                else onClose();
              }
              if (e.key === 'Enter') addItem();
            }}
          />
        </div>

        {/* Link row */}
        <div className="queue-link-row">
          {linkedDocId && linkedDocTitle ? (
            <span className="queue-link-selected">
              <span className="queue-link-selected-name">{linkedDocTitle}</span>
              <button className="queue-link-clear" onClick={clearLink} title="Remove link">×</button>
            </span>
          ) : (
            <button
              className="queue-link-btn"
              onClick={() => setLinkPickerOpen(!linkPickerOpen)}
            >
              🔗 Link to…
            </button>
          )}
        </div>

        {/* Link picker dropdown */}
        {linkPickerOpen && (
          <div className="queue-link-picker">
            <input
              ref={linkFilterRef}
              type="text"
              className="queue-link-filter"
              placeholder="Filter docs…"
              value={linkFilter}
              onChange={e => setLinkFilter(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setLinkPickerOpen(false);
                  setLinkFilter('');
                  inputRef.current?.focus();
                }
              }}
            />
            <div className="queue-link-list">
              {filteredDocs.length === 0 && (
                <div className="queue-empty">No matching docs</div>
              )}
              {filteredDocs.slice(0, 12).map(doc => (
                <button
                  key={doc.id}
                  className="queue-link-item"
                  onClick={() => selectLinkedDoc(doc)}
                >
                  <span className="queue-link-kind">{doc.kind}</span>
                  <span className="queue-link-title">{doc.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer hints + flash */}
        <div className="queue-footer">
          {addedFlash ? (
            <span className="queue-added">Added ✓</span>
          ) : (
            <span className="queue-hint">↵ Add · Esc Close</span>
          )}
        </div>
      </div>
    </div>
  );
}
