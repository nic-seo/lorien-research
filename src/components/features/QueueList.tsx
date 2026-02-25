import { useState } from 'react';
import { useQueue } from '../../db/hooks';
import { createDoc, updateDoc } from '../../db/index';
import type { QueueItem, QueueItemType } from '../../db/types';

interface QueueListProps {
  projectId: string;
}

const TYPE_LABELS: Record<QueueItemType, string> = {
  read: '📖',
  watch: '🎬',
  question: '❓',
  todo: '✓',
};

export default function QueueList({ projectId }: QueueListProps) {
  const { items: openItems } = useQueue(projectId, 'open');
  const { items: doneItems } = useQueue(projectId, 'done');
  const [text, setText] = useState('');
  const [itemType, setItemType] = useState<QueueItemType>('read');
  const [showDone, setShowDone] = useState(false);

  const addItem = async () => {
    if (!text.trim()) return;
    await createDoc<QueueItem>('queue-item', {
      projectId,
      text: text.trim(),
      itemType,
      linkedDocId: null,
      status: 'open',
      priority: 0,
    });
    setText('');
  };

  const toggleDone = async (item: QueueItem) => {
    await updateDoc<QueueItem>(item._id, {
      status: item.status === 'open' ? 'done' : 'open',
    });
  };

  return (
    <div className="queue-section">
      <div className="quick-add">
        <select
          className="quick-add-type"
          value={itemType}
          onChange={e => setItemType(e.target.value as QueueItemType)}
        >
          <option value="read">📖 Read</option>
          <option value="watch">🎬 Watch</option>
          <option value="question">❓ Question</option>
          <option value="todo">✓ Todo</option>
        </select>
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
        {openItems.length === 0 && (
          <div className="empty-state">Queue is empty — add something above</div>
        )}
        {openItems.map(item => (
          <div key={item._id} className="list-item">
            <button
              className="list-item-check"
              onClick={() => toggleDone(item)}
              title="Mark done"
            >
              ○
            </button>
            <span className="list-item-type">{TYPE_LABELS[item.itemType]}</span>
            <span className="list-item-text">{item.text}</span>
          </div>
        ))}
      </div>

      {doneItems.length > 0 && (
        <div className="queue-done-section">
          <button
            className="queue-done-toggle"
            onClick={() => setShowDone(!showDone)}
          >
            {showDone ? '▾' : '▸'} {doneItems.length} completed
          </button>
          {showDone &&
            doneItems.map(item => (
              <div key={item._id} className="list-item list-item-done">
                <button
                  className="list-item-check checked"
                  onClick={() => toggleDone(item)}
                  title="Reopen"
                >
                  ●
                </button>
                <span className="list-item-type">{TYPE_LABELS[item.itemType]}</span>
                <span className="list-item-text">{item.text}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
