import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';
import { useDoc, useProjectDocs, useLinks } from '../../db/hooks';
import { updateDoc, getDoc, createAttachment, getAttachmentBlob, getAttachmentData, forkChat } from '../../db';
import { sendChatMessage, generateChatTitle } from '../../lib/api';
import { usePanelNavigate } from '../../panels/usePanelNavigate';
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

// ---- Chat TOC ----

interface ChatSection { timestamp: string; content: string; msgIndex: number; }

function ChatTOC({ messages, forkBoundary = 0 }: { messages: ChatMessage[]; forkBoundary?: number }) {
  const [activeTs, setActiveTs] = useState('');
  const [inheritedExpanded, setInheritedExpanded] = useState(false);

  const sections: ChatSection[] = messages
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.role === 'section' && !!m.content.trim())
    .map(({ m, i }) => ({ timestamp: m.timestamp, content: m.content.trim(), msgIndex: i }));

  const inheritedSections = forkBoundary > 0 ? sections.filter((s) => s.msgIndex < forkBoundary) : [];
  const newSections = forkBoundary > 0 ? sections.filter((s) => s.msgIndex >= forkBoundary) : sections;

  useEffect(() => {
    if (sections.length === 0) return;
    const update = () => {
      const threshold = window.innerHeight * 0.35;
      let active = sections[0].timestamp;
      for (const s of sections) {
        const el = document.querySelector(`[data-section-ts="${s.timestamp}"]`);
        if (el && el.getBoundingClientRect().top <= threshold) active = s.timestamp;
      }
      setActiveTs(active);
    };
    update();
    window.addEventListener('scroll', update, true);
    return () => window.removeEventListener('scroll', update, true);
  }, [sections.map((s) => s.timestamp).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (s: ChatSection) => {
    const el = document.querySelector(`[data-section-ts="${s.timestamp}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveTs(s.timestamp); }
  };

  if (sections.length === 0 && inheritedSections.length === 0) return null;

  const tocLink = (s: ChatSection) => (
    <button
      key={s.timestamp}
      className={`chat-toc-link${activeTs === s.timestamp ? ' active' : ''}`}
      onClick={() => handleClick(s)}
    >
      {s.content}
    </button>
  );

  return (
    <nav className="chat-toc">
      <div className="chat-toc-inner">
        <div className="chat-toc-label">Contents</div>

        {/* Inherited sections (forked chats only) */}
        {inheritedSections.length > 0 && (
          <>
            {inheritedExpanded && (
              <div className="chat-toc-inherited">
                {inheritedSections.map(tocLink)}
              </div>
            )}
            <div className="chat-toc-fork-divider">
              <button
                className={`chat-toc-fork-toggle${inheritedExpanded ? ' expanded' : ''}`}
                onClick={() => setInheritedExpanded((v) => !v)}
                title={inheritedExpanded ? 'Hide inherited sections' : 'Show inherited sections'}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="fork-history-chevron">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>
          </>
        )}

        {newSections.map(tocLink)}
      </div>
    </nav>
  );
}

// ---- Main component ----

export default function ChatView() {
  const { projectId, chatId } = useParams<{ projectId: string; chatId: string }>();

  const { doc: chat } = useDoc<Chat>(chatId || null);
  const { doc: project } = useDoc<Project>(projectId || null);
  const { docs: reports } = useProjectDocs<Report>('report', projectId || null);
  const { links } = useLinks(chatId || null);
  const { doc: forkedFromChat } = useDoc<Chat>(chat?.forkedFromId ?? null);

  const panelNavigate = usePanelNavigate();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolTrace, setToolTrace] = useState<ChatToolEvent[]>([]);
  // Ref accumulates tool events synchronously so they're readable after sendChatMessage resolves
  const toolTraceAccRef = useRef<ChatToolEvent[]>([]);
  const [pendingEdits, setPendingEdits] = useState<(NoteEdit & { _messageIndex: number; _accepted?: boolean; _rejected?: boolean })[]>([]);
  const [savedTraces, setSavedTraces] = useState<Record<number, ChatToolEvent[]>>({});
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [forkHistoryExpanded, setForkHistoryExpanded] = useState(false);

  // Index of the first message that belongs to THIS fork (not inherited).
  // forkedAtIndex is the last inherited message (inclusive), so boundary = forkedAtIndex + 1.
  const forkBoundary = chat?.forkedFromId != null && chat?.forkedAtIndex != null
    ? chat.forkedAtIndex + 1
    : 0;

  // File attachments
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileUrls, setPendingFileUrls] = useState<string[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Map<string, { url: string; mimeType: string }>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlsRef = useRef<Map<string, { url: string; mimeType: string }>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suppressScrollRef = useRef(false);

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

  // Restore saved traces from persisted message data when a chat is loaded or switched
  useEffect(() => {
    if (!chat) return;
    const restored: Record<number, ChatToolEvent[]> = {};
    chat.messages.forEach((msg, i) => {
      if (msg.toolTrace && msg.toolTrace.length > 0) {
        restored[i] = msg.toolTrace as ChatToolEvent[];
      }
    });
    setSavedTraces(restored);
  }, [chat?._id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-scroll to bottom when messages change or trace grows.
  // Suppressed when inserting a section (we want to stay in place).
  useEffect(() => {
    if (suppressScrollRef.current) { suppressScrollRef.current = false; return; }
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
    return () => urlMap.forEach((u) => URL.revokeObjectURL(u.url));
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
    toolTraceAccRef.current = [];

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
      const sliced = updatedMessages.slice(summaryUpToIndex).filter(
        (m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'section'
      );

      // Build attachment cache: binary data keyed by attachment ID.
      // Current message's files are already in memory; historical ones are fetched from PouchDB.
      // The cache is passed to the server so the model can recall any attachment on demand via
      // the recall_attachment tool instead of receiving all binaries on every request.
      const attachmentCache: Record<string, { name: string; mimeType: string; data: string }> = {};

      // Seed cache with current message's files (avoids double-fetching from DB)
      for (let k = 0; k < attachmentIds.length; k++) {
        attachmentCache[attachmentIds[k]] = fileData[k];
      }

      const apiMessages = await Promise.all(sliced.map(async (m, i) => {
        // Current message: send binary inline so the model sees it immediately
        if (i === sliced.length - 1 && fileData.length > 0) {
          return { role: m.role, content: m.content, attachments: fileData };
        }
        // Historical messages: annotate with a lightweight text reference and cache the binary.
        // The model can use recall_attachment to retrieve the binary only when needed.
        if (m.attachmentIds && m.attachmentIds.length > 0) {
          try {
            const annotations: string[] = [];
            for (const id of m.attachmentIds) {
              if (!attachmentCache[id]) {
                const att = await getAttachmentData(id);
                attachmentCache[id] = att;
              }
              const att = attachmentCache[id];
              annotations.push(`[Attached: ${att.name} (${att.mimeType}, id: ${id})]`);
            }
            const annotated = m.content + (annotations.length > 0 ? '\n' + annotations.join('\n') : '');
            return { role: m.role, content: annotated };
          } catch {
            return { role: m.role, content: m.content };
          }
        }
        return { role: m.role, content: m.content };
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
        (event) => {
          toolTraceAccRef.current = [...toolTraceAccRef.current, event];
          setToolTrace((prev) => [...prev, event]);
        },
        linkedNotes,
        Object.keys(attachmentCache).length > 0 ? attachmentCache : undefined,
      );

      // Capture the trace synchronously from the ref (state may not have flushed yet)
      const traceSnapshot = toolTraceAccRef.current.length > 0
        ? [...toolTraceAccRef.current]
        : undefined;
      toolTraceAccRef.current = [];

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
        ...(traceSnapshot ? { toolTrace: traceSnapshot } : {}),
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

      // Update in-memory trace index and clear the live trace
      const msgIndex = updatedMessages.length; // index of the assistant message just added
      if (response.pendingEdits && response.pendingEdits.length > 0) {
        setPendingEdits((prev) => [
          ...prev,
          ...response.pendingEdits!.map((e) => ({ ...e, _messageIndex: msgIndex })),
        ]);
      }
      if (traceSnapshot) {
        setSavedTraces((prev) => ({ ...prev, [msgIndex]: traceSnapshot }));
      }
      setToolTrace([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response.');
    } finally {
      setSending(false);
    }
  };

  const handleFork = async (messageIndex: number, e: React.MouseEvent) => {
    if (!chatId || !chat || !projectId) return;
    try {
      const forked = await forkChat(chatId, messageIndex);
      panelNavigate(`/project/${projectId}/chat/${forked._id}`, e);
    } catch {
      setError('Failed to fork chat.');
    }
  };

  const insertSection = async (afterIndex: number) => {
    if (!chatId || !chat) return;
    suppressScrollRef.current = true;
    const newSection: ChatMessage = { role: 'section', content: '', timestamp: new Date().toISOString() };
    const newMessages = [
      ...chat.messages.slice(0, afterIndex + 1),
      newSection,
      ...chat.messages.slice(afterIndex + 1),
    ];
    await updateDoc<Chat>(chatId, { messages: newMessages });
    setEditingSectionIndex(afterIndex + 1);
  };

  const saveSection = async (index: number, text: string) => {
    if (!chatId || !chat) return;
    const trimmed = text.trim();
    if (!trimmed) {
      // Delete empty sections on blur
      const newMessages = chat.messages.filter((_, i) => i !== index);
      await updateDoc<Chat>(chatId, { messages: newMessages });
    } else {
      const newMessages = chat.messages.map((m, i) => i === index ? { ...m, content: trimmed } : m);
      await updateDoc<Chat>(chatId, { messages: newMessages });
    }
    setEditingSectionIndex(null);
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

  // ---- Message renderer (used for both inherited history and new messages) ----
  const renderMessage = (msg: ChatMessage, i: number): React.ReactNode => {
    // ---- Section header ----
    if (msg.role === 'section') {
      return (
        <div key={msg.timestamp} className="chat-section-wrap" data-section-ts={msg.timestamp}>
          <div
            className="chat-section-header"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Untitled section"
            ref={(el) => { if (el && editingSectionIndex === i) { el.focus(); } }}
            onBlur={(e) => saveSection(i, e.currentTarget.textContent || '')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
              if (e.key === 'Escape') { (e.target as HTMLElement).blur(); }
            }}
            onPaste={(e) => {
              e.preventDefault();
              document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
            }}
          >
            {msg.content}
          </div>
        </div>
      );
    }

    // ---- Normal message ----
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
                <div key={j} className={`chat-trace-item${event.tool === 'run_agent' ? ' chat-trace-item-agent' : ''}`}>
                  <span className="chat-trace-icon">
                    {event.tool === 'web_search' ? '⌕' :
                     event.tool === 'search_twitter' ? '𝕏' :
                     event.tool === 'search_youtube' ? '▶' :
                     event.tool === 'run_agent' ? '⬡' :
                     event.tool === 'read_note' ? '📖' :
                     event.tool === 'edit_note' ? '✏️' :
                     event.tool === 'recall_attachment' ? '📎' : '↗'}
                  </span>
                  <span className="chat-trace-label">
                    {event.tool === 'run_agent'
                      ? `${event.agentName}${event.task ? ` — ${event.task.slice(0, 60)}${event.task.length > 60 ? '…' : ''}` : ''}`
                      : event.tool === 'web_search' || event.tool === 'search_twitter' || event.tool === 'search_youtube'
                      ? event.query
                      : event.tool === 'read_note' || event.tool === 'edit_note'
                      ? event.noteTitle
                      : event.tool === 'recall_attachment'
                      ? event.attachmentName
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
        <div className="chat-msg-actions">
          <button
            className="chat-action-btn"
            onClick={() => insertSection(i)}
            title="Add section below"
          >#</button>
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
  };

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

      {chat.forkedFromId && (
        <div className="chat-fork-banner">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          Forked from{' '}
          {forkedFromChat ? (
            <button
              className="chat-fork-banner-link"
              onClick={(e) => panelNavigate(`/project/${projectId}/chat/${chat.forkedFromId}`, e)}
            >
              {forkedFromChat.title}
            </button>
          ) : (
            <span>original chat</span>
          )}
          {chat.forkedAtIndex != null && (
            <span className="chat-fork-banner-meta">· message {chat.forkedAtIndex + 1}</span>
          )}
        </div>
      )}

      <div className="chat-body">
        <div className="chat-toc-trigger" />
        <ChatTOC messages={chat.messages} forkBoundary={forkBoundary} />
      <div className="chat-messages" ref={messagesRef}>
          {chat.messages.length === 0 && !sending && (
            <div className="chat-empty">Start a conversation…</div>
          )}

          {/* Collapsible inherited history for forked chats */}
          {forkBoundary > 0 && (
            <>
              {forkHistoryExpanded && (
                <div className="fork-history-block">
                  {chat.messages.slice(0, forkBoundary).map((msg, i) => renderMessage(msg, i))}
                </div>
              )}

              {/* Divider always visible at the fork point */}
              <div className="fork-history-divider">
                <button
                  className={`fork-history-toggle${forkHistoryExpanded ? ' expanded' : ''}`}
                  onClick={() => setForkHistoryExpanded(v => !v)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="fork-history-chevron">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  {forkHistoryExpanded ? 'Hide' : 'Show'} {forkBoundary} inherited {forkBoundary === 1 ? 'message' : 'messages'}
                </button>
              </div>
            </>
          )}

          {chat.messages.slice(forkBoundary).map((msg, relIdx) => {
            const i = forkBoundary + relIdx;
            return renderMessage(msg, i);
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
                    <div key={i} className={`chat-trace-item${event.tool === 'run_agent' ? ' chat-trace-item-agent' : ''}`}>
                      <span className="chat-trace-icon">
                        {event.tool === 'web_search' ? '⌕' :
                         event.tool === 'search_twitter' ? '𝕏' :
                         event.tool === 'search_youtube' ? '▶' :
                         event.tool === 'run_agent' ? '⬡' :
                         event.tool === 'read_note' ? '📖' :
                         event.tool === 'edit_note' ? '✏️' :
                         event.tool === 'recall_attachment' ? '📎' : '↗'}
                      </span>
                      <span className="chat-trace-label">
                        {event.tool === 'run_agent'
                          ? `${event.agentName}${event.task ? ` — ${event.task.slice(0, 60)}${event.task.length > 60 ? '…' : ''}` : ''}`
                          : event.tool === 'web_search' || event.tool === 'search_twitter' || event.tool === 'search_youtube'
                          ? event.query
                          : event.tool === 'read_note' || event.tool === 'edit_note'
                          ? event.noteTitle
                          : event.tool === 'recall_attachment'
                          ? event.attachmentName
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
      </div>{/* end .chat-body */}

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
          <button
            className="chat-attach-btn"
            onClick={(e) => handleFork(chat.messages.length - 1, e)}
            title="Fork chat"
            disabled={sending || chat.messages.length === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
              <path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
