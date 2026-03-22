/**
 * CollapsibleHeadings — TipTap extension that lets users fold/unfold
 * content under any heading by clicking the small toggle arrow that
 * appears on heading hover (or stays visible when collapsed).
 *
 * Collapsed state is persisted to localStorage keyed by noteId so folds
 * survive page reloads. Headings are identified by slug (derived from
 * text content) rather than raw position, so persistence is stable even
 * if content is edited between sessions.
 *
 * Restoration happens after content is loaded (not on init) because the
 * editor starts with an empty doc — call restoreCollapsed(editor, noteId)
 * once after the first setContent call.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const KEY = new PluginKey<Set<number>>('collapsibleHeadings');

// Meta sent as a Set<number> replaces the entire state (used for restoration).
// Meta sent as a number toggles a single heading (normal user interaction).
type CollapseMeta = number | Set<number>;

// ---- Slug helpers (mirrors NoteView.tsx slugify) ----

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'heading';
}

/**
 * Build a map of slug → document position for every heading in the doc.
 * Duplicate headings get a -2, -3, … suffix, matching the TOC convention.
 */
function buildSlugMap(doc: Node): Map<string, number> {
  const map = new Map<string, number>();
  const seen: Record<string, number> = {};
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      const base = slugify(text);
      const count = (seen[base] = (seen[base] || 0) + 1);
      const slug = count > 1 ? `${base}-${count}` : base;
      map.set(slug, offset);
    }
    offset += node.nodeSize;
  }
  return map;
}

/**
 * Return the ordered list of slugs for whichever positions in `positions`
 * correspond to headings in `doc`.
 */
function positionsToSlugs(doc: Node, positions: Set<number>): string[] {
  const slugs: string[] = [];
  const seen: Record<string, number> = {};
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      const base = slugify(text);
      const count = (seen[base] = (seen[base] || 0) + 1);
      const slug = count > 1 ? `${base}-${count}` : base;
      if (positions.has(offset)) slugs.push(slug);
    }
    offset += node.nodeSize;
  }
  return slugs;
}

// ---- localStorage helpers ----

function storageKey(noteId: string) {
  return `collapsed:${noteId}`;
}

function loadSlugs(noteId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(noteId)) || '[]');
  } catch {
    return [];
  }
}

function saveSlugs(noteId: string, slugs: string[]) {
  try {
    localStorage.setItem(storageKey(noteId), JSON.stringify(slugs));
  } catch {
    // Ignore storage errors (private browsing, quota, etc.)
  }
}

// ---- Public restore helper ----
// Call this once after the note content has been loaded into the editor.

export function restoreCollapsed(editor: Editor, noteId: string) {
  const slugs = loadSlugs(noteId);
  if (slugs.length === 0) return;
  const slugMap = buildSlugMap(editor.state.doc);
  const positions = new Set<number>();
  for (const slug of slugs) {
    const pos = slugMap.get(slug);
    if (pos != null) positions.add(pos);
  }
  if (positions.size > 0) {
    editor.view.dispatch(editor.state.tr.setMeta(KEY, positions));
  }
}

// ---- Extension ----

export const CollapsibleHeadings = Extension.create<{ noteId?: string }>({
  name: 'collapsibleHeadings',

  addOptions() {
    return { noteId: undefined };
  },

  addProseMirrorPlugins() {
    const { noteId } = this.options;

    return [
      new Plugin<Set<number>>({
        key: KEY,

        state: {
          init: () => new Set<number>(),

          apply(tr, prev) {
            const meta = tr.getMeta(KEY) as CollapseMeta | undefined;
            if (meta != null) {
              // Set<number> = restore entire state at once (after setContent)
              if (meta instanceof Set) return meta;
              // number = toggle a single heading
              const next = new Set(prev);
              next.has(meta) ? next.delete(meta) : next.add(meta);
              return next;
            }
            // Remap positions when the document changes
            if (tr.docChanged) {
              const next = new Set<number>();
              for (const pos of prev) {
                const mapped = tr.mapping.map(pos);
                if (tr.doc.nodeAt(mapped)?.type.name === 'heading') {
                  next.add(mapped);
                }
              }
              return next;
            }
            return prev;
          },
        },

        // Persist to localStorage whenever the collapsed set changes
        view() {
          return {
            update(view, prevState) {
              if (!noteId) return;
              const prev = KEY.getState(prevState)!;
              const curr = KEY.getState(view.state)!;
              if (curr !== prev) {
                saveSlugs(noteId, positionsToSlugs(view.state.doc, curr));
              }
            },
          };
        },

        props: {
          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement;
            if (!target.classList.contains('note-fold-btn')) return false;

            let el: HTMLElement | null = target.parentElement;
            while (el && !/^H[1-6]$/.test(el.tagName)) {
              el = el.parentElement;
            }
            if (!el) return false;

            const headingPos = view.posAtDOM(el, 0) - 1;
            if (view.state.doc.nodeAt(headingPos)?.type.name !== 'heading') return false;

            view.dispatch(view.state.tr.setMeta(KEY, headingPos));
            return true;
          },

          decorations(state) {
            const collapsed = KEY.getState(state)!;
            const doc = state.doc;
            const decos: Decoration[] = [];

            const topLevel: Array<{ pos: number; nodeSize: number; name: string; level: number }> = [];
            let offset = 0;
            for (let i = 0; i < doc.childCount; i++) {
              const node = doc.child(i);
              topLevel.push({
                pos: offset,
                nodeSize: node.nodeSize,
                name: node.type.name,
                level: (node.attrs.level as number) ?? 0,
              });
              offset += node.nodeSize;
            }

            for (let i = 0; i < topLevel.length; i++) {
              const { pos, nodeSize, name, level } = topLevel[i];
              if (name !== 'heading') continue;

              const isCollapsed = collapsed.has(pos);

              decos.push(
                Decoration.widget(
                  pos + 1,
                  () => {
                    const btn = document.createElement('span');
                    btn.className = `note-fold-btn${isCollapsed ? ' is-collapsed' : ''}`;
                    btn.setAttribute('contenteditable', 'false');
                    btn.setAttribute('aria-label', isCollapsed ? 'Expand section' : 'Collapse section');
                    return btn;
                  },
                  { side: -1, key: `fold:${pos}:${isCollapsed}` }
                )
              );

              if (!isCollapsed) continue;

              let foldEnd = doc.content.size;
              for (let j = i + 1; j < topLevel.length; j++) {
                const sib = topLevel[j];
                if (sib.name === 'heading' && sib.level <= level) {
                  foldEnd = sib.pos;
                  break;
                }
              }

              const headingEnd = pos + nodeSize;
              for (let j = i + 1; j < topLevel.length; j++) {
                const sib = topLevel[j];
                if (sib.pos < headingEnd) continue;
                if (sib.pos >= foldEnd) break;
                decos.push(
                  Decoration.node(sib.pos, sib.pos + sib.nodeSize, {
                    style: 'display: none',
                  })
                );
              }
            }

            return DecorationSet.create(doc, decos);
          },
        },
      }),
    ];
  },
});
