import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';
import { useDoc, useProjectDocs, useLinks } from '../../db/hooks';
import { updateDoc, getDoc } from '../../db';
import { sendChatMessage, generateChatTitle } from '../../lib/api';
import type { ChatToolEvent, LinkedNoteInput, NoteEdit } from '../../lib/api';
import type { Chat, ChatMessage, Project, Report, Note } from '../../db/types';
import DocHeader from './DocHeader';

marked.setOptions({ breaks: true });

export default function ChatView() {
  const { projectId, chatId } = useParams<{ projectId: string; chatId: string }>();

  const { doc: chat } = useDoc<Chat>(chatId || null);
  const { doc: project } = useDoc<Project>(projectId || null);
  const { docs: reports } = useProjectDocs<Report>('report', projectId || null);
  const { links } = useLinks(chatId || null);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolTrace, setToolTrace] = useState<ChatToolEvent[]>([]);
  const [pendingEdits, setPendingEdits] = useState<(NoteEdit & { _messageIndex: number; _accepted?: boolean; _rejected?: boolean })[]>([]);
  const [savedTraces, setSavedTraces] = useState<Record<number, ChatToolEvent[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Show scrollbar only while scrolling
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      el.classList.add('is-scrolling');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('is-scrolling'), 1000);
    };
    el.addEventListener('scroll', onScroll);
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer); };
  }, []);

  // Auto-scroll to bottom when messages change or trace grows
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages.length, sending, toolTrace.length]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const handleSend = async () => {
    if (!input.trim() || sending || !chat || !project || !chatId) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...chat.messages, userMessage];

    // Clear input immediately
    setInput('');
    setError(null);
    setSending(true);
    setToolTrace([]);

    // Persist user message
    try {
      await updateDoc<Chat>(chatId, { messages: updatedMessages });
    } catch {
      setError('Failed to save message.');
      setSending(false);
      return;
    }

    // Auto-title using Haiku (fire-and-forget). Retries on every send until a
    // title sticks — always based on the first user message in the chat.
    if (chat.title === 'New chat') {
      const firstUserMsg =
        chat.messages.find(m => m.role === 'user')?.content ?? userMessage.content;
      generateChatTitle(firstUserMsg).then(title => {
        updateDoc<Chat>(chatId, { title }).catch(() => {});
      });
    }

    // Call the API
    try {
      // Only send messages that aren't already covered by the stored summary.
      // The server will summarize further if this slice is still too large.
      const summaryUpToIndex = chat.summaryUpToIndex ?? 0;
      const apiMessages = updatedMessages.slice(summaryUpToIndex).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const projectContext = {
        title: project.title,
        description: project.description,
        reportTitles: reports.map((r) => r.title),
      };

      // Fetch linked note content to send with the request
      const noteLinks = links.filter((l) => l.docType === 'note');
      let linkedNotes: LinkedNoteInput[] | undefined;
      if (noteLinks.length > 0) {
        const noteResults = await Promise.all(
          noteLinks.map(async (link) => {
            try {
              const note = await getDoc<Note>(link.docId);
              return { id: note._id, title: note.title, content: note.content };
            } catch {
              return null;
            }
          })
        );
        linkedNotes = noteResults.filter(Boolean) as LinkedNoteInput[];
      }

      const response = await sendChatMessage(
        apiMessages,
        projectContext,
        chat.summary,
        (event) => setToolTrace((prev) => [...prev, event]),
        linkedNotes,
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
      };

      // If the server compressed some messages into a new summary, persist the
      // updated summary and advance the summaryUpToIndex so future requests
      // don't re-send those messages.
      const docUpdates: Partial<Chat> = {
        messages: [...updatedMessages, assistantMessage],
      };
      if (response.newSummary != null && response.summarizedCount != null) {
        docUpdates.summary = response.newSummary;
        docUpdates.summaryUpToIndex = summaryUpToIndex + response.summarizedCount;
      }

      await updateDoc<Chat>(chatId, docUpdates);

      // Save tool trace and proposed edits, anchored to this assistant message
      const msgIndex = updatedMessages.length; // index of the assistant message just added
      if (response.pendingEdits && response.pendingEdits.length > 0) {
        setPendingEdits((prev) => [
          ...prev,
          ...response.pendingEdits!.map((e) => ({ ...e, _messageIndex: msgIndex })),
        ]);
      }
      // Persist trace for this message so it survives after sending ends
      setToolTrace((trace) => {
        if (trace.length > 0) {
          setSavedTraces((prev) => ({ ...prev, [msgIndex]: trace }));
        }
        return [];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAcceptEdit = async (index: number) => {
    const edit = pendingEdits[index];
    try {
      const note = await getDoc<Note>(edit.noteId);
      if (!note.content.includes(edit.oldText)) {
        setError(`Edit failed: the note "${edit.noteTitle}" has changed since this edit was proposed.`);
        return;
      }
      const updatedContent = note.content.replace(edit.oldText, edit.newText);
      await updateDoc<Note>(edit.noteId, { content: updatedContent });
      setPendingEdits((prev) => prev.map((e, i) =>
        i === index ? { ...e, _accepted: true } : e
      ));
    } catch {
      setError(`Failed to apply edit to "${edit.noteTitle}".`);
    }
  };

  const handleRejectEdit = (index: number) => {
    setPendingEdits((prev) => prev.map((e, i) =>
      i === index ? { ...e, _rejected: true } : e
    ));
  };

  if (!chat) return <div className="page-loading">Loading…</div>;

  return (
    <div className="chat-page">
      <DocHeader
        backPath={`/project/${projectId}?tab=chats`}
        docId={chatId}
        docType="chat"
        projectId={projectId}
      />

      <div className="chat-title-bar">
        <span className="chat-title-text">{chat.title}</span>
      </div>

      <div className="chat-messages" ref={messagesRef}>
          {chat.messages.length === 0 && !sending && (
            <div className="chat-empty">Start a conversation…</div>
          )}

          {chat.messages.map((msg, i) => {
            const editsForMessage = pendingEdits
              .map((e, idx) => ({ ...e, _globalIndex: idx }))
              .filter((e) => e._messageIndex === i && !e._rejected);
            const trace = savedTraces[i];

            return (
              <div key={i} className={`chat-message-wrap ${msg.role === 'user' ? 'chat-message-wrap-user' : ''}`}>
                {trace && trace.length > 0 && (
                  <details className="chat-trace-toggle">
                    <summary className="chat-trace-summary">
                      {trace.length} tool {trace.length === 1 ? 'call' : 'calls'}
                    </summary>
                    <div className="chat-trace">
                      {trace.map((event, j) => (
                        <div key={j} className="chat-trace-item">
                          <span className="chat-trace-icon">
                            {event.tool === 'web_search' ? '⌕' :
                             event.tool === 'read_note' ? '📖' :
                             event.tool === 'edit_note' ? '✏️' : '↗'}
                          </span>
                          <span className="chat-trace-label">
                            {event.tool === 'web_search'
                              ? event.query
                              : event.tool === 'read_note' || event.tool === 'edit_note'
                              ? event.noteTitle
                              : event.domain ?? event.url}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <div
                  className={`chat-message ${msg.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      className="chat-message-content chat-message-md"
                      dangerouslySetInnerHTML={{ __html: marked(msg.content) as string }}
                    />
                  ) : (
                    <div className="chat-message-content">{msg.content}</div>
                  )}
                </div>

                {editsForMessage.length > 0 && (
                  <div className="chat-edit-proposals">
                    {editsForMessage.map((edit) => (
                      <div key={edit._globalIndex} className={`chat-edit-proposal ${edit._accepted ? 'chat-edit-accepted' : ''}`}>
                        <div className="chat-edit-header">
                          <span className="chat-edit-icon">✏️</span>
                          <span className="chat-edit-title">{edit.noteTitle}</span>
                          {edit._accepted && <span className="chat-edit-badge">Applied</span>}
                        </div>
                        {!edit._accepted && (
                          <>
                            <div className="chat-edit-diff">
                              <div className="chat-edit-old">{edit.oldText}</div>
                              <div className="chat-edit-arrow">→</div>
                              <div className="chat-edit-new">{edit.newText}</div>
                            </div>
                            <div className="chat-edit-actions">
                              <button
                                className="chat-edit-accept"
                                onClick={() => handleAcceptEdit(edit._globalIndex)}
                              >
                                Accept
                              </button>
                              <button
                                className="chat-edit-reject"
                                onClick={() => handleRejectEdit(edit._globalIndex)}
                              >
                                Reject
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {sending && (
            <div className="chat-message chat-message-assistant">
              <div className="chat-thinking-dots">
                <span />
                <span />
                <span />
              </div>
              {toolTrace.length > 0 && (
                <div className="chat-trace">
                  {toolTrace.map((event, i) => (
                    <div key={i} className="chat-trace-item">
                      <span className="chat-trace-icon">
                        {event.tool === 'web_search' ? '⌕' :
                         event.tool === 'read_note' ? '📖' :
                         event.tool === 'edit_note' ? '✏️' : '↗'}
                      </span>
                      <span className="chat-trace-label">
                        {event.tool === 'web_search'
                          ? event.query
                          : event.tool === 'read_note' || event.tool === 'edit_note'
                          ? event.noteTitle
                          : event.domain ?? event.url}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <div className="chat-error">{error}</div>}

          <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          rows={1}
        />
      </div>
    </div>
  );
}
