import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { marked } from 'marked';
import { useDoc } from '../db/hooks';
import { updateDoc, deleteDoc } from '../db';
import type { Note } from '../db/types';
import DocHeader from '../components/features/DocHeader';

marked.setOptions({ breaks: true, gfm: true });

export default function NoteView() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const navigate = useNavigate();
  const { doc: note, loading } = useDoc<Note>(noteId || null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editingBody, setEditingBody] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync local state when note loads
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      // New empty notes: open body for editing immediately
      if (note.content === '') {
        setEditingBody(true);
      }
    }
  }, [note?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize textarea to fit content
  useEffect(() => {
    if (editingBody && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = Math.max(200, ta.scrollHeight) + 'px';
    }
  }, [editingBody, content]);

  // Save helper
  const save = useCallback(async (newTitle: string, newContent: string) => {
    if (!noteId) return;
    await updateDoc<Note>(noteId, {
      title: newTitle.trim() || 'Untitled',
      content: newContent,
    });
  }, [noteId]);

  // Debounced auto-save while typing
  const debouncedSave = useCallback((newTitle: string, newContent: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(newTitle, newContent), 800);
  }, [save]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    debouncedSave(newTitle, content);
  };

  const handleTitleBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    save(title, content);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    debouncedSave(title, newContent);
  };

  const handleBodyBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    save(title, content);
    setEditingBody(false);
  };

  const handleBodyClick = () => {
    setEditingBody(true);
  };

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editingBody && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingBody]);

  // Escape exits body editing
  useEffect(() => {
    if (!editingBody) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        textareaRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingBody]);

  const handleDelete = useCallback(async () => {
    if (!noteId) return;
    if (!window.confirm('Delete this note?')) return;
    await deleteDoc(noteId);
    navigate(-1);
  }, [noteId, navigate]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (!note) return <div className="page-loading">Note not found.</div>;

  return (
    <div className="page">
      <DocHeader
        backPath={`/project/${projectId}`}
        docId={noteId}
        docType="note"
        projectId={projectId}
      />

      <div className="note-view-header">
        <div className="note-view-actions">
          <button className="btn" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <input
        type="text"
        className="note-editor-title"
        value={title}
        onChange={e => handleTitleChange(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Untitled"
      />

      {editingBody ? (
        <textarea
          ref={textareaRef}
          className="note-editor-textarea"
          value={content}
          onChange={e => handleContentChange(e.target.value)}
          onBlur={handleBodyBlur}
          placeholder="Start writing... (markdown supported)"
        />
      ) : (
        <div
          className="note-body"
          onClick={handleBodyClick}
        >
          {content ? (
            <div dangerouslySetInnerHTML={{ __html: marked(content) as string }} />
          ) : (
            <div className="note-empty-body">
              Click to start writing...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
