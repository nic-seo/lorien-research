import { useParams } from 'react-router-dom';
import { useEffect, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { ResizableImage } from '../lib/resizableImage';
import { Markdown } from 'tiptap-markdown';
import { marked } from 'marked';
import { CollapsibleHeadings, restoreCollapsed } from '../lib/collapsibleHeadings';
import { useDoc } from '../db/hooks';
import { updateDoc } from '../db';
import type { Note } from '../db/types';
import DocHeader from '../components/features/DocHeader';
import { printNote } from '../lib/printDoc';

// --- Image helpers ---

const MAX_IMAGE_PX = 1600; // max dimension before resizing

/** Resize an image file to fit within MAX_IMAGE_PX × MAX_IMAGE_PX, return base64 data URI. */
async function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_IMAGE_PX || height > MAX_IMAGE_PX) {
        const scale = MAX_IMAGE_PX / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      // Use PNG for images that might have transparency, JPEG otherwise
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(mime, 0.85));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// ---- Note TOC ----

interface HeadingItem {
  id: string;
  text: string;
  level: number;
  pos: number; // ProseMirror doc position (inside the heading node)
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'heading';
}

function extractHeadings(editor: Editor): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const seen: Record<string, number> = {};
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (!text) return;
      const slug = slugify(text);
      const count = (seen[slug] = (seen[slug] || 0) + 1);
      headings.push({
        id: count > 1 ? `${slug}-${count}` : slug,
        text,
        level: node.attrs.level as number,
        pos: offset + 1, // +1 = first position inside the node
      });
    }
  });
  return headings;
}

// Resolve the live heading DOM element for a ProseMirror position.
// TipTap may replace DOM nodes at any time, so we always look up fresh.
function getHeadingEl(editor: Editor, pos: number): Element | null {
  try {
    const { node } = editor.view.domAtPos(pos);
    let el: Element | null = node.nodeType === 1 ? (node as Element) : (node as Text).parentElement;
    while (el && !['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)) {
      el = el.parentElement;
    }
    return el;
  } catch {
    return null;
  }
}

function NoteTOC({ editor }: { editor: Editor }) {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState('');

  // Re-extract headings whenever editor content changes
  useEffect(() => {
    const update = () => setHeadings(extractHeadings(editor));
    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  // Track active heading. note-scroll is the scroll container; capture phase
  // on window catches it regardless. We use domAtPos to get live DOM refs
  // instead of querying by ID (TipTap replaces nodes, wiping stamped IDs).
  useEffect(() => {
    if (headings.length === 0) return;
    const update = () => {
      const threshold = window.innerHeight * 0.35;
      let active = headings[0].id;
      for (const h of headings) {
        const el = getHeadingEl(editor, h.pos);
        if (el && el.getBoundingClientRect().top <= threshold) active = h.id;
      }
      setActiveId(active);
    };
    update();
    window.addEventListener('scroll', update, true);
    return () => window.removeEventListener('scroll', update, true);
  }, [headings, editor]);

  const handleClick = (h: HeadingItem) => {
    const el = getHeadingEl(editor, h.pos);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(h.id);
    }
  };

  if (headings.length === 0) return null;

  return (
    <nav className="note-toc">
      <div className="note-toc-inner">
        <div className="note-toc-label">Contents</div>
        {headings.map((h) => (
          <button
            key={h.id}
            className={`note-toc-link${h.level >= 3 ? ' sub' : ''}${activeId === h.id ? ' active' : ''}`}
            onClick={() => handleClick(h)}
          >
            {h.text}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---- Main component ----

export default function NoteView() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const { doc: note, loading } = useDoc<Note>(noteId || null);

  const titleDivRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef('');
  const contentRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  /** Insert one image file into the editor at current cursor. */
  const insertImage = useCallback(async (file: File) => {
    if (!ALLOWED_IMAGE_MIME.has(file.type)) return;
    try {
      const src = await resizeToDataUrl(file);
      editorRef.current?.chain().focus().setImage({ src, alt: file.name, title: '' }).run();
    } catch {
      // silently skip unreadable files
    }
  }, []);

  // Keep a stable ref to the editor so insertImage (stable callback) can access it
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      CollapsibleHeadings.configure({ noteId: noteId || undefined }),
      TableKit.configure({ table: { resizable: false } }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
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
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const images = files.filter(f => ALLOWED_IMAGE_MIME.has(f.type));
        if (images.length === 0) return false;
        event.preventDefault();
        // Place cursor at drop position
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) view.dispatch(view.state.tr.setSelection(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).prosemirror?.TextSelection?.create?.(view.state.doc, pos.pos) ??
          view.state.tr.selection
        ));
        images.forEach(f => insertImage(f));
        return true;
      },
      handlePaste(_view, event) {
        const files = Array.from(event.clipboardData?.files ?? []);
        const images = files.filter(f => ALLOWED_IMAGE_MIME.has(f.type));
        if (images.length === 0) return false;
        event.preventDefault();
        images.forEach(f => insertImage(f));
        return true;
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

  // Keep editorRef in sync so insertImage (stable callback) always has the latest editor
  useEffect(() => { editorRef.current = editor; }, [editor]);

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
        // Restore persisted collapsed headings after setContent populates the doc.
        // Called every time setContent runs (safe — in practice only fires on
        // initial load since content equality guards skip subsequent calls).
        if (noteId) restoreCollapsed(editor, noteId);
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach(f => insertImage(f));
          e.target.value = '';
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
        <button
          className="note-image-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Insert image (or paste / drag-and-drop)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
      </div>

      <div className="note-content">
        <div className="note-toc-trigger" />
        {editor && <NoteTOC editor={editor} />}
        <div className="note-scroll">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
