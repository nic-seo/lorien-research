import { useState, useRef, useEffect } from 'react';
import { quickQuestion } from '../../lib/api';
import type { QuickQAEntry } from '../../lib/api';

interface QuickLookupOverlayProps {
  onClose: () => void;
}

export default function QuickLookupOverlay({ onClose }: QuickLookupOverlayProps) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QuickQAEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll thread to bottom when history updates
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [history, loading]);

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;

    setQuestion('');
    setError(null);
    setLoading(true);

    // Optimistically append the user's question
    const userEntry: QuickQAEntry = { role: 'user', content: q };
    const nextHistory = [...history, userEntry];
    setHistory(nextHistory);

    try {
      const { answer } = await quickQuestion(q, history);
      setHistory([...nextHistory, { role: 'assistant', content: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      // Roll back the optimistic user entry
      setHistory(history);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const hasContent = history.length > 0 || loading || error;

  return (
    <div className="lookup-overlay" onClick={onClose}>
      <div className="lookup-modal" onClick={e => e.stopPropagation()}>

        {/* Conversation thread */}
        {hasContent && (
          <div className="lookup-thread" ref={threadRef}>
            {history.map((entry, i) => (
              <div key={i} className={`lookup-entry lookup-entry-${entry.role}`}>
                {entry.role === 'user' ? (
                  <span className="lookup-q">{entry.content}</span>
                ) : (
                  <span className="lookup-a">{entry.content}</span>
                )}
              </div>
            ))}

            {loading && (
              <div className="lookup-entry lookup-entry-assistant">
                <span className="lookup-a lookup-thinking">thinking…</span>
              </div>
            )}

            {error && (
              <div className="lookup-entry lookup-entry-error">
                <span className="lookup-error">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Input row */}
        <div className="lookup-input-row">
          <input
            ref={inputRef}
            type="text"
            className="lookup-input"
            placeholder={history.length === 0 ? 'Ask anything…' : 'Ask a follow-up…'}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') ask();
              if (e.key === 'Escape') onClose();
            }}
            disabled={loading}
          />
        </div>

        {/* Footer */}
        <div className="lookup-hint">↵ Ask · Esc Close</div>
      </div>
    </div>
  );
}
