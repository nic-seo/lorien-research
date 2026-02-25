import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';
import { makeId } from '../lib/ulid';
import type { AnyDoc, DocType, Link, QueueItem } from './types';

PouchDB.plugin(PouchDBFind);

// Single database for all documents
const db = new PouchDB<AnyDoc>('research-workspace');

// Create indexes for common queries
async function ensureIndexes() {
  await db.createIndex({ index: { fields: ['type'] } });
  await db.createIndex({ index: { fields: ['type', 'projectId'] } });
  await db.createIndex({ index: { fields: ['type', 'status'] } });
  await db.createIndex({ index: { fields: ['sourceId'] } });
  await db.createIndex({ index: { fields: ['targetId'] } });
}

ensureIndexes().catch(console.error);

// --- CRUD helpers ---

export async function createDoc<T extends AnyDoc>(
  type: DocType,
  data: Omit<T, '_id' | '_rev' | 'type' | 'createdAt' | 'updatedAt'>
): Promise<T> {
  const now = new Date().toISOString();
  const doc = {
    _id: makeId(type),
    type,
    createdAt: now,
    updatedAt: now,
    ...data,
  } as unknown as T;

  const result = await db.put(doc as unknown as AnyDoc);
  return { ...doc, _rev: result.rev };
}

export async function getDoc<T extends AnyDoc>(id: string): Promise<T> {
  return (await db.get(id)) as unknown as T;
}

export async function updateDoc<T extends AnyDoc>(
  id: string,
  updates: Partial<Omit<T, '_id' | '_rev' | 'type' | 'createdAt'>>
): Promise<T> {
  const existing = await db.get(id);
  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const result = await db.put(updated);
  return { ...updated, _rev: result.rev } as unknown as T;
}

export async function deleteDoc(id: string): Promise<void> {
  const doc = await db.get(id);
  await db.remove(doc);
}

// --- Query helpers ---

export async function getDocsByType<T extends AnyDoc>(type: DocType): Promise<T[]> {
  const result = await db.find({
    selector: { type },
    sort: [{ type: 'asc' }],
  });
  return result.docs as unknown as T[];
}

export async function getProjectDocs<T extends AnyDoc>(
  type: DocType,
  projectId: string
): Promise<T[]> {
  const result = await db.find({
    selector: { type, projectId },
  });
  return result.docs as unknown as T[];
}

export async function getQueueItems(
  projectId: string,
  status?: 'open' | 'done'
): Promise<QueueItem[]> {
  const selector: Record<string, unknown> = {
    type: 'queue-item',
    projectId,
  };
  if (status) selector.status = status;

  const result = await db.find({ selector });
  return result.docs as unknown as QueueItem[];
}

// --- Link helpers ---

export async function createLink(
  sourceId: string,
  sourceType: DocType,
  targetId: string,
  targetType: DocType
): Promise<Link> {
  return createDoc<Link>('link', {
    sourceId,
    sourceType,
    targetId,
    targetType,
  });
}

export async function getLinksFor(docId: string): Promise<Link[]> {
  const [asSource, asTarget] = await Promise.all([
    db.find({ selector: { type: 'link', sourceId: docId } }),
    db.find({ selector: { type: 'link', targetId: docId } }),
  ]);
  const all = [...asSource.docs, ...asTarget.docs] as unknown as Link[];
  // Deduplicate by _id
  const seen = new Set<string>();
  return all.filter(link => {
    if (seen.has(link._id)) return false;
    seen.add(link._id);
    return true;
  });
}

// --- Change feed ---

export function onChange(callback: () => void) {
  const changes = db.changes({
    since: 'now',
    live: true,
  });
  changes.on('change', callback);
  return () => changes.cancel();
}

// --- Bulk operations ---

export async function bulkCreate(docs: AnyDoc[]): Promise<void> {
  await db.bulkDocs(docs);
}

export { db };
