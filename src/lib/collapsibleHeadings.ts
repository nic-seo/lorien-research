/**
 * CollapsibleHeadings — TipTap extension that lets users fold/unfold
 * content under any heading by clicking the small toggle arrow that
 * appears on heading hover (or stays visible when collapsed).
 *
 * Collapsed state lives entirely in ProseMirror plugin state (in-memory).
 * Positions are remapped whenever the document changes so folds stay on
 * the right headings as the user edits.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const KEY = new PluginKey<Set<number>>('collapsibleHeadings');

export const CollapsibleHeadings = Extension.create({
  name: 'collapsibleHeadings',

  addProseMirrorPlugins() {
    return [
      new Plugin<Set<number>>({
        key: KEY,

        // --- Plugin state: a Set of heading document-positions that are collapsed ---
        state: {
          init: () => new Set<number>(),

          apply(tr, prev) {
            // A meta value = the heading position to toggle
            const meta = tr.getMeta(KEY) as number | undefined;
            if (meta != null) {
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

        props: {
          // Click the fold button → toggle that heading's fold
          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement;
            if (!target.classList.contains('note-fold-btn')) return false;

            // Walk up to the heading DOM element
            let el: HTMLElement | null = target.parentElement;
            while (el && !/^H[1-6]$/.test(el.tagName)) {
              el = el.parentElement;
            }
            if (!el) return false;

            // posAtDOM returns position at the start of the heading's content;
            // subtract 1 to get the heading node's own position.
            const headingPos = view.posAtDOM(el, 0) - 1;
            if (view.state.doc.nodeAt(headingPos)?.type.name !== 'heading') return false;

            view.dispatch(view.state.tr.setMeta(KEY, headingPos));
            return true; // Prevent cursor placement on the button click
          },

          decorations(state) {
            const collapsed = KEY.getState(state)!;
            const doc = state.doc;
            const decos: Decoration[] = [];

            // Build a flat list of top-level nodes with their document positions
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

              // Fold toggle button inserted at the very start of the heading's content
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

              // Find where this fold ends: next heading at same or higher level
              let foldEnd = doc.content.size;
              for (let j = i + 1; j < topLevel.length; j++) {
                const sib = topLevel[j];
                if (sib.name === 'heading' && sib.level <= level) {
                  foldEnd = sib.pos;
                  break;
                }
              }

              // Apply display:none to every top-level node inside the fold range
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
