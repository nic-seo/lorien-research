import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';
import { useDoc, useProjectDocs } from '../../db/hooks';
import { updateDoc } from '../../db';
import { sendChatMessage, generateChatTitle } from '../../lib/api';
import type { Chat, ChatMessage, Project, Report } from '../../db/types';
import DocHeader from './DocHeader';

marked.setOptions({ breaks: true });

export default function ChatView() {
  const { projectId, chatId } = useParams<{ projectId: string; chatId: string }>();

  const { doc: chat } = useDoc<Chat>(chatId || null);
  const { doc: project } = useDoc<Project>(projectId || null);
  const { docs: reports } = useProjectDocs<Report>('report', projectId || null);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages.length, sending]);

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
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const projectContext = {
        title: project.title,
        description: project.description,
        reportTitles: reports.map((r) => r.title),
      };

      const response = await sendChatMessage(apiMessages, projectContext);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
      };

      await updateDoc<Chat>(chatId, {
        messages: [...updatedMessages, assistantMessage],
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

          {chat.messages.map((msg, i) => (
            <div
              key={i}
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
          ))}

          {sending && (
            <div className="chat-message chat-message-assistant">
              <div className="chat-thinking-dots">
                <span />
                <span />
                <span />
              </div>
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
