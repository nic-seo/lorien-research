import { useState, useEffect, useCallback } from 'react';
import { getDoc, getDocsByType, getProjectDocs, getQueueItems, onChange } from './index';
import type { AnyDoc, DocType, QueueItem } from './types';

// Single document hook
export function useDoc<T extends AnyDoc>(id: string | null) {
  const [doc, setDoc] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!id) { setDoc(null); setLoading(false); return; }
    try {
      setLoading(true);
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

  useEffect(() => { refresh(); }, [refresh]);

  // Re-fetch on database changes
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
      setLoading(true);
      const result = await getDocsByType<T>(type);
      setDocs(result);
    } catch (err) {
      console.error(`Failed to load ${type} docs:`, err);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { refresh(); }, [refresh]);
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
      setLoading(true);
      const result = await getProjectDocs<T>(type, projectId);
      setDocs(result);
    } catch (err) {
      console.error(`Failed to load ${type} for project ${projectId}:`, err);
    } finally {
      setLoading(false);
    }
  }, [type, projectId]);

  useEffect(() => { refresh(); }, [refresh]);
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
      setLoading(true);
      const result = await getQueueItems(projectId, status);
      setItems(result);
    } catch (err) {
      console.error(`Failed to load queue for project ${projectId}:`, err);
    } finally {
      setLoading(false);
    }
  }, [projectId, status]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onChange(refresh), [refresh]);

  return { items, loading, refresh };
}
