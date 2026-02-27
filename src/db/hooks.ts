import { useState, useEffect, useCallback } from 'react';
import { getDoc, getDocsByType, getProjectDocs, getQueueItems, getLinksFor, onChange } from './index';
import type { AnyDoc, DocType, Link, QueueItem } from './types';

export interface ResolvedLink {
  linkId: string;
  docId: string;
  docType: DocType;
  title: string;
  projectId: string | null;
}

// Single document hook
export function useDoc<T extends AnyDoc>(id: string | null) {
  const [doc, setDoc] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!id) { setDoc(null); setLoading(false); return; }
    try {
      const result = await getDoc<T>(id);
      setDoc(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial load (show loading spinner)
  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  // Re-fetch on database changes (silent — no loading flash)
  useEffect(() => {
    return onChange(() => { if (id) refresh(); });
  }, [id, refresh]);

  return { doc, loading, error, refresh };
}

// Documents by type hook
export function useDocs<T extends AnyDoc>(type: DocType) {
  const [docs, setDocs] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await getDocsByType<T>(type);
      setDocs(result);
    } catch (err) {
      console.error(`Failed to load ${type} docs:`, err);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);
  useEffect(() => onChange(refresh), [refresh]);

  return { docs, loading, refresh };
}

// Project-scoped documents hook
export function useProjectDocs<T extends AnyDoc>(type: DocType, projectId: string | null) {
  const [docs, setDocs] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) { setDocs([]); setLoading(false); return; }
    try {
      const result = await getProjectDocs<T>(type, projectId);
      setDocs(result);
    } catch (err) {
      console.error(`Failed to load ${type} for project ${projectId}:`, err);
    } finally {
      setLoading(false);
    }
  }, [type, projectId]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);
  useEffect(() => onChange(refresh), [refresh]);

  return { docs, loading, refresh };
}

// Queue items hook
export function useQueue(projectId: string | null, status?: 'open' | 'done') {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) { setItems([]); setLoading(false); return; }
    try {
      const result = await getQueueItems(projectId, status);
      setItems(result);
    } catch (err) {
      console.error(`Failed to load queue for project ${projectId}:`, err);
    } finally {
      setLoading(false);
    }
  }, [projectId, status]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);
  useEffect(() => onChange(refresh), [refresh]);

  return { items, loading, refresh };
}

// Linked documents hook — resolves the "other side" of each link
export function useLinks(docId: string | null) {
  const [links, setLinks] = useState<ResolvedLink[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!docId) { setLinks([]); setLoading(false); return; }
    try {
      const rawLinks = await getLinksFor(docId);
      const resolved = await Promise.all(
        rawLinks.map(async (link: Link) => {
          // Determine which side is the "other" document
          const otherId = link.sourceId === docId ? link.targetId : link.sourceId;
          const otherType = link.sourceId === docId ? link.targetType : link.sourceType;
          try {
            const doc = await getDoc<AnyDoc>(otherId);
            const title = 'title' in doc ? (doc as { title: string }).title : otherId;
            const projectId = 'projectId' in doc ? (doc as { projectId: string | null }).projectId : null;
            return { linkId: link._id, docId: otherId, docType: otherType, title, projectId };
          } catch {
            // Document may have been deleted
            return null;
          }
        })
      );
      setLinks(resolved.filter(Boolean) as ResolvedLink[]);
    } catch (err) {
      console.error('Failed to load links:', err);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);
  useEffect(() => onChange(refresh), [refresh]);

  return { links, loading, refresh };
}
