import { useEffect, useRef, type RefObject } from 'react';
import { usePanels } from '../panels/PanelContext';
import { createDoc, findReferenceByUrl } from '../db';
import type { Reference } from '../db/types';

/** True if href is http(s) and not same-origin. */
function isExternalUrl(href: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin !== window.location.origin
    );
  } catch {
    return false;
  }
}

/** Extract projectId from a panel path like /project/:id/... */
function extractProjectId(path: string): string | null {
  const match = path.match(/^\/project\/([^/?]+)/);
  return match ? match[1] : null;
}

/** Walk composedPath() to find an <a> with an href. */
function findAnchorFromEvent(event: MouseEvent): HTMLAnchorElement | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement && node.href) return node;
    if (node instanceof HTMLElement && node.classList.contains('panel')) break;
  }
  return null;
}

/** Walk composedPath() to find the panel's data-panel-id. */
function findPanelIdFromEvent(event: MouseEvent): string | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLElement && node.classList.contains('panel')) {
      return node.getAttribute('data-panel-id');
    }
  }
  return null;
}

/** Simple heuristic: YouTube/Vimeo → video, arXiv/Scholar → paper, else link. */
function guessRefType(url: string): 'video' | 'paper' | 'link' {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes('youtube') || h.includes('vimeo')) return 'video';
    if (h.includes('arxiv') || h.includes('scholar.google')) return 'paper';
  } catch { /* ignore */ }
  return 'link';
}

/**
 * Intercepts Ctrl/Cmd+Click on external <a> links anywhere inside the
 * content area (including Shadow DOM in reports).
 *
 * On intercept:
 *  1. Opens the URL in a new panel as an iframe embed.
 *  2. Saves the URL as a Reference document (with dedup).
 */
export function useExternalLinkInterceptor(
  contentAreaRef: RefObject<HTMLDivElement | null>,
) {
  const { addPanel, getPanelLocation } = usePanels();

  // Keep stable refs so we don't re-attach the listener on every render
  const addPanelRef = useRef(addPanel);
  const getPanelLocationRef = useRef(getPanelLocation);
  addPanelRef.current = addPanel;
  getPanelLocationRef.current = getPanelLocation;

  useEffect(() => {
    const container = contentAreaRef.current;
    if (!container) return;

    const handleClick = (event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      const anchor = findAnchorFromEvent(event);
      if (!anchor || !isExternalUrl(anchor.href)) return;

      event.preventDefault();
      event.stopPropagation();

      const href = anchor.href;

      // 1. Open in new panel
      addPanelRef.current(`/embed?url=${encodeURIComponent(href)}`);

      // 2. Save as reference (fire-and-forget)
      const panelId = findPanelIdFromEvent(event);
      const panelPath = panelId ? getPanelLocationRef.current(panelId) : '/';
      const projectId = extractProjectId(panelPath);

      if (projectId) {
        const title = anchor.textContent?.trim() || new URL(href).hostname;
        const refType = guessRefType(href);

        findReferenceByUrl(projectId, href)
          .then(existing => {
            if (!existing) {
              return createDoc<Reference>('reference', {
                projectId,
                title,
                url: href,
                refType,
                author: '',
                notes: '',
                tags: [],
              });
            }
          })
          .catch(err => console.error('Failed to save reference:', err));
      }
    };

    // Capture phase so we run before target="_blank" default navigation
    container.addEventListener('click', handleClick, true);
    return () => container.removeEventListener('click', handleClick, true);
  }, [contentAreaRef]);
}
