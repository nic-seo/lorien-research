import { useParams } from 'react-router-dom';
import { useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from 'tiptap-markdown';
import { marked } from 'marked';
import { CollapsibleHeadings } from '../lib/collapsibleHeadings';
import { useDoc } from '../db/hooks';
import { updateDoc } from '../db';
import type { Note } from '../db/types';
import DocHeader from '../components/features/DocHeader';
import { printNote } from '../lib/printDoc';

export default function NoteView() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const { doc: note, loading } = useDoc<Note>(noteId || null);

  const titleDivRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef('');
  const contentRef = useRef('');
  // Prevents onUpdate → scheduleSave loop when setContent is called programmatically
  const isSyncingRef = useRef(false);

  // Normalize content for comparison — tiptap-markdown may add/remove trailing newlines
  const normalize = (s: string) => s.trim();

  // Collapse double newlines between markdown table rows so markdown-it recognises
  // them as a table. This repairs content that was saved before table support existed
  // (each row was a paragraph → serialised with \n\n between rows).
  const fixTableNewlines = (s: string) =>
    s.replace(/(\|[^\n]*)\n\n(?=\s*\|)/g, '$1\n');

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
      CollapsibleHeadings,
      TableKit.configure({ table: { resizable: false } }),
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
      // Skip saves triggered by our own setContent calls — they don't represent
      // user edits and would cause a save → re-fetch → setContent → cursor-jump loop.
      if (isSyncingRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contentRef.current = (editor.storage as any).markdown.getMarkdown();
      scheduleSave();
    },
  });

  // Sync local state when note loads or is updated externally (e.g. chat edit).
  // IMPORTANT: skip content sync while the editor is focused — the user is
  // actively typing, so their in-progress text is always more current than
  // whatever the DB just returned from the last debounced save.  Overwriting
  // here is exactly what causes the cursor-jump bug.
  useEffect(() => {
    if (note && editor) {
      if (normalize(contentRef.current) !== normalize(note.content) && !editor.isFocused) {
        isSyncingRef.current = true;
        contentRef.current = note.content;
        editor.commands.setContent(fixTableNewlines(note.content));
        isSyncingRef.current = false;
      }
      if (titleRef.current !== note.title) {
        titleRef.current = note.title;
        if (titleDivRef.current) {
          titleDivRef.current.textContent = note.title;
        }
      }
    }
  }, [note?._rev, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed title div on initial load
  useEffect(() => {
    if (note && titleDivRef.current && titleDivRef.current.textContent === '') {
      titleDivRef.current.textContent = note.title;
      titleRef.current = note.title;
    }
  }, [note]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleTitleInput = (e: React.FormEvent<HTMLDivElement>) => {
    titleRef.current = e.currentTarget.textContent || '';
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
        onDownload={() => {
          const bodyHtml = marked.parse(note.content || '') as string;
          printNote(note.title, bodyHtml);
        }}
      />

      <div className="doc-title-bar">
        <div
          ref={titleDivRef}
          className="doc-title-input"
          contentEditable
          suppressContentEditableWarning
          onInput={handleTitleInput}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          data-placeholder="Untitled"
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
        />
      </div>

      <div className="note-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
