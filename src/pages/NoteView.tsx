import { useParams } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { useDoc } from '../db/hooks';
import { updateDoc } from '../db';
import type { Note } from '../db/types';
import DocHeader from '../components/features/DocHeader';

export default function NoteView() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const { doc: note, loading } = useDoc<Note>(noteId || null);

  const [title, setTitle] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef('');
  const contentRef = useRef('');

  // Keep refs in sync with state
  titleRef.current = title;

  // Save helper
  const save = useCallback(async (newTitle: string, newContent: string) => {
    if (!noteId) return;
    await updateDoc<Note>(noteId, {
      title: newTitle.trim() || 'Untitled',
      content: newContent,
    });
  }, [noteId]);

  // Debounced save using refs for latest values
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      save(titleRef.current, contentRef.current);
    }, 800);
  }, [save]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'note-body',
      },
    },
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contentRef.current = (editor.storage as any).markdown.getMarkdown();
      scheduleSave();
    },
  });

  // Sync local state when note loads
  useEffect(() => {
    if (note && editor) {
      setTitle(note.title);
      titleRef.current = note.title;
      contentRef.current = note.content;
      editor.commands.setContent(note.content);
    }
  }, [note?._id, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    titleRef.current = newTitle;
    scheduleSave();
  };

  const handleTitleBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    save(titleRef.current, contentRef.current);
  };

  // Enter in title field focuses the editor
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor?.commands.focus('start');
    }
  };

  if (loading) return <div className="page-loading">Loading...</div>;
  if (!note) return <div className="page-loading">Note not found.</div>;

  return (
    <div className="note-page">
      <DocHeader
        backPath={`/project/${projectId}?tab=notes`}
        docId={noteId}
        docType="note"
        projectId={projectId}
      />

      <div className="note-scroll">
        <input
          type="text"
          className="note-editor-title"
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
        />

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
