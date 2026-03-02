import { useState, useEffect, useRef } from 'react';
import { Link as LinkIcon, Tag, Circle } from 'lucide-react';
import { usePanels } from '../../panels/PanelContext';
import { useDocs, useProjectDocs, useQueue } from '../../db/hooks';
import { createDoc, updateDoc } from '../../db/index';
import type { Project, Report, Note, Chat, Reference, QueueItem, Topic } from '../../db/types';

interface QuickAddOverlayProps {
  onClose: () => void;
}

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
  const [text, setText] = useState('');
  const [addedFlash, setAddedFlash] = useState(false);

  // Link state
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkFilter, setLinkFilter] = useState('');
  const [linkedDocId, setLinkedDocId] = useState<string | null>(null);
  const [linkedDocTitle, setLinkedDocTitle] = useState<string | null>(null);

  // Topic state
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [topicFilter, setTopicFilter] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const linkFilterRef = useRef<HTMLInputElement>(null);
  const topicFilterRef = useRef<HTMLInputElement>(null);

  // Fetch project docs for the link picker
  const { docs: reports } = useProjectDocs<Report>('report', selectedProjectId);
  const { docs: notes } = useProjectDocs<Note>('note', selectedProjectId);
  const { docs: chats } = useProjectDocs<Chat>('chat', selectedProjectId);
  const { docs: refs } = useProjectDocs<Reference>('reference', selectedProjectId);

  // Fetch topics for topic picker
  const { docs: allTopics } = useProjectDocs<Topic>('topic', selectedProjectId);

  // Fetch open queue items for the selected project
  const { items: openItems } = useQueue(selectedProjectId || '', 'open');

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

  const filteredTopics = topicFilter.trim()
    ? allTopics.filter(t => t.name.toLowerCase().includes(topicFilter.toLowerCase()))
    : allTopics;

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Focus pickers when they open
  useEffect(() => {
    if (linkPickerOpen) linkFilterRef.current?.focus();
  }, [linkPickerOpen]);

  useEffect(() => {
    if (topicPickerOpen) topicFilterRef.current?.focus();
  }, [topicPickerOpen]);

  // Find project name
  const selectedProject = projects.find(p => p._id === selectedProjectId);

  const addItem = async () => {
    if (!text.trim() || !selectedProjectId) return;
    await createDoc<QueueItem>('queue-item', {
      projectId: selectedProjectId,
      text: text.trim(),
      linkedDocId: linkedDocId,
      topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
      status: 'open',
      priority: 0,
    });
    setText('');
    setLinkedDocId(null);
    setLinkedDocTitle(null);
    setSelectedTopicIds([]);
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1200);
    inputRef.current?.focus();
  };

  const toggleDone = async (item: QueueItem) => {
    await updateDoc<QueueItem>(item._id, {
      status: item.status === 'open' ? 'done' : 'open',
    });
  };

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setLinkedDocId(null);
    setLinkedDocTitle(null);
    setSelectedTopicIds([]);
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

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds(prev =>
      prev.includes(topicId) ? prev.filter(id => id !== topicId) : [...prev, topicId],
    );
  };

  const openLinkPicker = () => {
    setTopicPickerOpen(false);
    setTopicFilter('');
    setLinkPickerOpen(true);
  };

  const openTopicPicker = () => {
    setLinkPickerOpen(false);
    setLinkFilter('');
    setTopicPickerOpen(true);
  };

  const closePickers = () => {
    setLinkPickerOpen(false);
    setLinkFilter('');
    setTopicPickerOpen(false);
    setTopicFilter('');
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
        {/* Header: project name */}
        <div className="queue-modal-header">
          <button
            className="queue-project-label clickable"
            onClick={() => { setSelectedProjectId(null); }}
            title="Change project"
          >
            {selectedProject?.title ?? 'Unknown project'}
          </button>
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
                if (linkPickerOpen || topicPickerOpen) closePickers();
                else onClose();
              }
              if (e.key === 'Enter') addItem();
            }}
          />
        </div>

        {/* Meta row: link + topic buttons */}
        <div className="queue-meta-row">
          {/* Link side */}
          {linkedDocId && linkedDocTitle ? (
            <span className="queue-link-selected">
              <span className="queue-link-selected-name">{linkedDocTitle}</span>
              <button className="queue-link-clear" onClick={clearLink} title="Remove link">×</button>
            </span>
          ) : (
            <button
              className={`queue-meta-btn ${linkPickerOpen ? 'active' : ''}`}
              onClick={() => linkPickerOpen ? closePickers() : openLinkPicker()}
            >
              <LinkIcon size={11} /> Link
            </button>
          )}

          {/* Topic side */}
          <div className="queue-topic-chips">
            {selectedTopicIds.map(id => {
              const topic = allTopics.find(t => t._id === id);
              if (!topic) return null;
              return (
                <span key={id} className="queue-topic-chip">
                  {topic.name}
                  <button
                    className="queue-topic-chip-remove"
                    onClick={() => toggleTopic(id)}
                    title="Remove topic"
                  >×</button>
                </span>
              );
            })}
            <button
              className={`queue-meta-btn ${topicPickerOpen ? 'active' : ''}`}
              onClick={() => topicPickerOpen ? closePickers() : openTopicPicker()}
            >
              <Tag size={11} /> Topic
            </button>
          </div>
        </div>

        {/* Link picker */}
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
                if (e.key === 'Escape') closePickers();
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

        {/* Topic picker */}
        {topicPickerOpen && (
          <div className="queue-link-picker">
            <input
              ref={topicFilterRef}
              type="text"
              className="queue-link-filter"
              placeholder="Filter topics…"
              value={topicFilter}
              onChange={e => setTopicFilter(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') closePickers();
              }}
            />
            <div className="queue-link-list">
              {filteredTopics.length === 0 && (
                <div className="queue-empty">No topics in this project</div>
              )}
              {filteredTopics.map(topic => {
                const selected = selectedTopicIds.includes(topic._id);
                return (
                  <button
                    key={topic._id}
                    className={`queue-link-item ${selected ? 'selected' : ''}`}
                    onClick={() => toggleTopic(topic._id)}
                  >
                    <span className="queue-link-kind">{selected ? '✓' : ''}</span>
                    <span className="queue-link-title">{topic.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Current queue items */}
        {openItems.length > 0 && (
          <div className="queue-overlay-items">
            {openItems.map(item => (
              <div key={item._id} className="queue-overlay-item">
                <button
                  className="queue-overlay-check"
                  onClick={() => toggleDone(item)}
                  title="Mark done"
                >
                  <Circle size={12} />
                </button>
                <span className="queue-overlay-text">{item.text}</span>
              </div>
            ))}
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
