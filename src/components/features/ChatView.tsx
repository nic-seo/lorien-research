import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';
import { useDoc, useProjectDocs, useLinks } from '../../db/hooks';
import { updateDoc, getDoc, createAttachment, getAttachmentBlob } from '../../db';
import { sendChatMessage, generateChatTitle } from '../../lib/api';
import type { ChatToolEvent, LinkedNoteInput, NoteEdit } from '../../lib/api';
import type { Chat, ChatMessage, Project, Report, Note } from '../../db/types';
import DocHeader from './DocHeader';
import { printChat } from '../../lib/printDoc';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5 MB
const MAX_PDF_BYTES   = 32 * 1024 * 1024; // 32 MB

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

  // File attachments
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileUrls, setPendingFileUrls] = useState<string[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Map<string, { url: string; mimeType: string }>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlsRef = useRef<Map<string, { url: string; mimeType: string }>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Editable title
  const titleDivRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef('');
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (chat && titleDivRef.current) {
      if (titleDivRef.current.textContent !== chat.title) {
        titleDivRef.current.textContent = chat.title;
        titleRef.current = chat.title;
      }
    }
  }, [chat?._rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleInput = (e: React.FormEvent<HTMLDivElement>) => {
    titleRef.current = e.currentTarget.textContent || '';
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => {
      if (chatId) updateDoc<Chat>(chatId, { title: titleRef.current.trim() || 'Untitled' });
    }, 800);
  };

  const handleTitleBlur = () => {
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    if (chatId) updateDoc<Chat>(chatId, { title: titleRef.current.trim() || 'Untitled' });
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); textareaRef.current?.focus(); }
  };

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

  // Create object URLs for pending files (preview before send)
  useEffect(() => {
    const urls = pendingFiles.map((f) => URL.createObjectURL(f));
    setPendingFileUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [pendingFiles]);

  // Load blob URLs for attachment IDs that appear in chat history
  useEffect(() => {
    if (!chat?.messages) return;
    const allIds = chat.messages.flatMap((m) => m.attachmentIds ?? []);
    const newIds = allIds.filter((id) => !blobUrlsRef.current.has(id));
    if (newIds.length === 0) return;
    Promise.all(
      newIds.map(async (id) => {
        try {
          const blob = await getAttachmentBlob(id);
          const url = URL.createObjectURL(blob);
          blobUrlsRef.current.set(id, { url, mimeType: blob.type });
        } catch {
          // silently skip missing attachments
        }
      }),
    ).then(() => setAttachmentUrls(new Map(blobUrlsRef.current)));
  }, [chat?.messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke blob URLs on unmount
  useEffect(() => {
    const urlMap = blobUrlsRef.current;
    return () => urlMap.forEach((u) => URL.revokeObjectURL(u));
  }, []);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const valid: File[] = [];
    for (const f of files) {
      if (f.type === 'application/pdf') {
        if (f.size > MAX_PDF_BYTES) { setError(`"${f.name}" exceeds 32 MB limit.`); continue; }
        valid.push(f);
      } else if (ALLOWED_IMAGE_TYPES.has(f.type)) {
        if (f.size > MAX_IMAGE_BYTES) { setError(`"${f.name}" exceeds 5 MB limit.`); continue; }
        valid.push(f);
      } else {
        setError(`"${f.name}" is not a supported type (images or PDF only).`);
      }
    }
    setPendingFiles((prev) => [...prev, ...valid]);
  };

  const handleSend = async () => {
    const hasText = input.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if ((!hasText && !hasFiles) || sending || !chat || !project || !chatId) return;

    // Read and store attachments before building the message
    let attachmentIds: string[] = [];
    let fileData: { name: string; mimeType: string; data: string }[] = [];

    if (hasFiles) {
      try {
        fileData = await Promise.all(
          pendingFiles.map(async (f) => ({
            name: f.name,
            mimeType: f.type,
            data: await readFileAsBase64(f),
          })),
        );
        attachmentIds = await Promise.all(
          fileData.map((fd) =>
            createAttachment(chatId, fd.name, fd.mimeType, pendingFiles.find((f) => f.name === fd.name)!.size, fd.data),
          ),
        );
      } catch {
        setError('Failed to process attachments.');
        return;
      }
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
      ...(attachmentIds.length > 0 && { attachmentIds }),
    };

    const updatedMessages = [...chat.messages, userMessage];

    // Clear input and pending files immediately
    setInput('');
    setPendingFiles([]);
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
      const sliced = updatedMessages.slice(summaryUpToIndex);
      const apiMessages = sliced.map((m, i) => ({
        role: m.role,
        content: m.content,
        // Attach file data only on the last (just-sent) user message
        ...(i === sliced.length - 1 && fileData.length > 0 && { attachments: fileData }),
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
        onDownload={() => printChat(chat.title, project?.title ?? '', chat.messages ?? [])}
      />

      <div className="doc-title-bar chat-title-bar">
        <div
          ref={titleDivRef}
          className="chat-title-text"
          contentEditable
          suppressContentEditableWarning
          onInput={handleTitleInput}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          data-placeholder="Untitled"
          onPaste={(e) => {
            e.preventDefault();
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          }}
        />
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
                  {msg.attachmentIds && msg.attachmentIds.length > 0 && (
                    <div className="chat-message-attachments">
                      {msg.attachmentIds.map((id) => {
                        const entry = attachmentUrls.get(id);
                        if (!entry) return <span key={id} className="chat-message-attachment-pdf">Loading…</span>;
                        return entry.mimeType.startsWith('image/') ? (
                          <a key={id} href={entry.url} target="_blank" rel="noreferrer">
                            <img className="chat-message-attachment-img" src={entry.url} alt="attachment" />
                          </a>
                        ) : (
                          <a key={id} className="chat-message-attachment-pdf" href={entry.url} target="_blank" rel="noreferrer">
                            📄 PDF attachment
                          </a>
                        );
                      })}
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <div
                      className="chat-message-content chat-message-md"
                      dangerouslySetInnerHTML={{ __html: marked(msg.content) as string }}
                    />
                  ) : (
                    msg.content && <div className="chat-message-content">{msg.content}</div>
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
        {pendingFiles.length > 0 && (
          <div className="chat-pending-attachments">
            {pendingFiles.map((file, i) => (
              <div key={i} className="chat-attachment-chip">
                {file.type.startsWith('image/') ? (
                  <img className="chat-attachment-thumb" src={pendingFileUrls[i]} alt={file.name} />
                ) : (
                  <span className="chat-attachment-icon">📄</span>
                )}
                <span className="chat-attachment-name">{file.name}</span>
                <button
                  className="chat-attachment-remove"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  title="Remove"
                >×</button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
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
          <button
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image or PDF"
            disabled={sending}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
