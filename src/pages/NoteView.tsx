import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
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

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);

  // Sync local state when note loads
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      // Open in edit mode if it's a brand-new empty note
      if (note.content === '' && !editing) {
        setIsNew(true);
        setEditing(true);
      }
    }
  }, [note?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track dirty state
  const dirty = editing && note
    ? title !== note.title || content !== note.content
    : false;

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Keyboard shortcuts in edit mode
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, title, content, note]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    if (!noteId || saving) return;
    setSaving(true);
    try {
      await updateDoc<Note>(noteId, {
        title: title.trim() || 'Untitled',
        content,
      });
      setEditing(false);
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  }, [noteId, title, content, saving]);

  const handleCancel = useCallback(() => {
    if (dirty) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
    }
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    }
    setEditing(false);
    // If it was a brand-new note the user cancelled, go back
    if (isNew) {
      navigate(-1);
    }
  }, [dirty, note, isNew, navigate]);

  const handleEdit = useCallback(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    }
    setEditing(true);
  }, [note]);

  const handleDelete = useCallback(async () => {
    if (!noteId) return;
    if (!window.confirm('Delete this note?')) return;
    await deleteDoc(noteId);
    navigate(-1);
  }, [noteId, navigate]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

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
          {editing ? (
            <>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn" onClick={handleCancel}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={handleEdit}>
                Edit
              </button>
              <button className="btn" onClick={handleDelete}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <input
            type="text"
            className="note-editor-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Note title..."
            autoFocus={isNew}
          />
          <textarea
            className="note-editor-textarea"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write in markdown..."
            autoFocus={!isNew}
          />
        </>
      ) : (
        <>
          <h2 className="note-title">{note.title}</h2>
          <div className="note-meta">
            Updated {formatDate(note.updatedAt)}
          </div>
          {note.content ? (
            <div
              className="note-body"
              dangerouslySetInnerHTML={{ __html: marked(note.content) as string }}
            />
          ) : (
            <div className="note-empty-body">
              This note is empty. Click Edit to start writing.
            </div>
          )}
        </>
      )}
    </div>
  );
}
