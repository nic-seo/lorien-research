import { useState } from 'react';
import { Circle, CheckCircle2, GripVertical } from 'lucide-react';
import { useQueue } from '../../db/hooks';
import { createDoc, updateDoc } from '../../db/index';
import type { QueueItem } from '../../db/types';

interface QueueListProps {
  projectId: string;
}

export default function QueueList({ projectId }: QueueListProps) {
  const { items: openItems } = useQueue(projectId, 'open');
  const { items: doneItems } = useQueue(projectId, 'done');
  const [text, setText] = useState('');

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'top' | 'bottom'>('bottom');

  const addItem = async () => {
    if (!text.trim()) return;
    await createDoc<QueueItem>('queue-item', {
      projectId,
      text: text.trim(),
      linkedDocId: null,
      status: 'open',
      // New items go to the end
      priority: openItems.length > 0 ? openItems[openItems.length - 1].priority + 1 : 0,
    });
    setText('');
  };

  const toggleDone = async (item: QueueItem) => {
    await updateDoc<QueueItem>(item._id, {
      status: item.status === 'open' ? 'done' : 'open',
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id === draggedId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOverId(id);
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom');
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const items = [...openItems];
    const fromIdx = items.findIndex(i => i._id === draggedId);
    if (fromIdx === -1) return;

    const [dragged] = items.splice(fromIdx, 1);
    const toIdx = items.findIndex(i => i._id === targetId);
    const insertAt = dragOverPos === 'top' ? toIdx : toIdx + 1;
    items.splice(insertAt, 0, dragged);

    // Write new priority = index for each item that changed
    await Promise.all(
      items.map((item, idx) =>
        item.priority !== idx ? updateDoc<QueueItem>(item._id, { priority: idx }) : Promise.resolve(),
      ),
    );

    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="queue-section">
      <div className="quick-add">
        <input
          type="text"
          className="quick-add-input"
          placeholder="Add to queue…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addItem();
          }}
        />
        <button className="btn btn-primary" onClick={addItem} disabled={!text.trim()}>
          Add
        </button>
      </div>

      <div className="queue-items">
        {openItems.length === 0 && doneItems.length === 0 && (
          <div className="empty-state">Queue is empty — add something above</div>
        )}
        {openItems.map(item => (
          <div
            key={item._id}
            className={[
              'queue-item',
              draggedId === item._id ? 'queue-item-dragging' : '',
              dragOverId === item._id ? `queue-item-drop-${dragOverPos}` : '',
            ].filter(Boolean).join(' ')}
            draggable
            onDragStart={e => handleDragStart(e, item._id)}
            onDragOver={e => handleDragOver(e, item._id)}
            onDrop={e => handleDrop(e, item._id)}
            onDragEnd={handleDragEnd}
          >
            <span className="queue-item-grip" title="Drag to reorder">
              <GripVertical size={13} />
            </span>
            <button
              className="list-item-check"
              onClick={() => toggleDone(item)}
              title="Mark done"
            >
              <Circle size={13} />
            </button>
            <span className="queue-item-text">{item.text}</span>
          </div>
        ))}
      </div>

      {doneItems.length > 0 && (
        <div className="queue-done-section">
          <div className="queue-done-label">Completed</div>
          {doneItems.map(item => (
            <div key={item._id} className="queue-item queue-item-done">
              <span className="queue-item-grip" />
              <button
                className="list-item-check checked"
                onClick={() => toggleDone(item)}
                title="Reopen"
              >
                <CheckCircle2 size={13} />
              </button>
              <span className="queue-item-text">{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
