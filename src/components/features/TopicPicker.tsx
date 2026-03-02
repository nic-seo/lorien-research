import { useState, useRef, useEffect } from 'react';
import { Tag } from 'lucide-react';
import { useDoc, useProjectDocs } from '../../db/hooks';
import { createDoc, updateDoc } from '../../db';
import type { Topic, Note } from '../../db/types';

// TopicPicker works on any doc that has an optional topicIds field.
// We use Note as the concrete type for TypeScript since all topicable doc
// types (Note, Report, Chat, Reference) share the same topicIds?: string[] shape.
type TopicableDoc = Note;

interface TopicPickerProps {
  docId: string;
  projectId: string;
}

function getTopicIds(doc: TopicableDoc | null): string[] {
  return Array.isArray(doc?.topicIds) ? doc!.topicIds! : [];
}

export default function TopicPicker({ docId, projectId }: TopicPickerProps) {
  const { doc } = useDoc<TopicableDoc>(docId);
  const { docs: allTopics } = useProjectDocs<Topic>('topic', projectId);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTopicIds = getTopicIds(doc);
  const hasTopics = currentTopicIds.length > 0;

  const trimmed = filter.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  const filtered = lowerTrimmed
    ? allTopics.filter(t => t.name.toLowerCase().includes(lowerTrimmed))
    : allTopics;

  const exactMatch = trimmed
    ? allTopics.find(t => t.name.toLowerCase() === lowerTrimmed)
    : null;

  const canCreate = trimmed.length > 0 && !exactMatch;

  // Sort: assigned first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aAssigned = currentTopicIds.includes(a._id);
    const bAssigned = currentTopicIds.includes(b._id);
    if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setFilter('');
    }
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

  const toggleTopic = async (topicId: string) => {
    const current = getTopicIds(doc);
    const next = current.includes(topicId)
      ? current.filter(id => id !== topicId)
      : [...current, topicId];
    await updateDoc<TopicableDoc>(docId, { topicIds: next }).catch(() => {});
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key !== 'Enter') return;

    if (exactMatch) {
      await toggleTopic(exactMatch._id);
      setFilter('');
    } else if (canCreate) {
      const newTopic = await createDoc<Topic>('topic', { name: trimmed, projectId });
      const current = getTopicIds(doc);
      await updateDoc<TopicableDoc>(docId, { topicIds: [...current, newTopic._id] }).catch(() => {});
      setFilter('');
    }
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    const newTopic = await createDoc<Topic>('topic', { name: trimmed, projectId });
    const current = getTopicIds(doc);
    await updateDoc<TopicableDoc>(docId, { topicIds: [...current, newTopic._id] }).catch(() => {});
    setFilter('');
  };

  return (
    <div className="topic-picker" ref={containerRef}>
      <button
        className={`topic-picker-btn ${hasTopics ? 'has-topics' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title={hasTopics ? `Topics: ${currentTopicIds.length}` : 'Add topic'}
      >
        <Tag size={13} />
        {hasTopics && (
          <span className="topic-picker-count">{currentTopicIds.length}</span>
        )}
      </button>

      {open && (
        <div className="topic-picker-dropdown">
          <input
            ref={inputRef}
            type="text"
            className="topic-picker-input"
            placeholder="Filter or create…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="topic-picker-list">
            {sorted.length === 0 && !canCreate && (
              <div className="topic-picker-empty">No topics yet — type to create one</div>
            )}
            {sorted.map(topic => {
              const assigned = currentTopicIds.includes(topic._id);
              return (
                <button
                  key={topic._id}
                  className={`topic-picker-item ${assigned ? 'assigned' : ''}`}
                  onClick={() => toggleTopic(topic._id)}
                >
                  <span className="topic-picker-check">{assigned ? '✓' : ''}</span>
                  <span className="topic-picker-name">{topic.name}</span>
                </button>
              );
            })}
            {canCreate && (
              <button className="topic-picker-item topic-picker-create" onClick={handleCreate}>
                <span className="topic-picker-check">+</span>
                <span className="topic-picker-name">Create "{trimmed}"</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
