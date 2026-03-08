import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';
import { makeId } from '../lib/ulid';
import type { AnyDoc, DocType, Link, QueueItem, Reference } from './types';

PouchDB.plugin(PouchDBFind);

// Single database for all documents
const db = new PouchDB<AnyDoc>('research-workspace');

// Expose db globally for migration/debugging from DevTools console
(window as any).__db = db;

// Create indexes for common queries
async function ensureIndexes() {
  await db.createIndex({ index: { fields: ['type'] } });
  await db.createIndex({ index: { fields: ['type', 'projectId'] } });
  await db.createIndex({ index: { fields: ['type', 'status'] } });
  await db.createIndex({ index: { fields: ['sourceId'] } });
  await db.createIndex({ index: { fields: ['targetId'] } });
  await db.createIndex({ index: { fields: ['type', 'projectId', 'url'] } });
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

/**
 * Cascade-delete a project and all its children (reports, notes, chats,
 * references, queue-items) plus any Link documents that reference them.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const childTypes: DocType[] = ['report', 'note', 'chat', 'reference', 'queue-item'];

  // Gather all child docs
  const childResults = await Promise.all(
    childTypes.map(type => getProjectDocs(type, projectId))
  );
  const allChildren = childResults.flat();

  // Gather links for the project itself + every child
  const linkResults = await Promise.all([
    getLinksFor(projectId),
    ...allChildren.map(child => getLinksFor(child._id)),
  ]);
  const allLinks = linkResults.flat();

  // Deduplicate links
  const seen = new Set<string>();
  const uniqueLinks = allLinks.filter(link => {
    if (seen.has(link._id)) return false;
    seen.add(link._id);
    return true;
  });

  // Fetch the project doc
  const project = await db.get(projectId);

  // Bulk-delete everything
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toDelete = [...allChildren, ...uniqueLinks, project].map(doc => ({
    _id: doc._id,
    _rev: (doc as any)._rev,
    _deleted: true as const,
  }));

  if (toDelete.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.bulkDocs(toDelete as any[]);
  }
}

/**
 * Delete a report and any Link documents that reference it.
 */
export async function deleteReport(reportId: string): Promise<void> {
  const [report, links] = await Promise.all([
    db.get(reportId),
    getLinksFor(reportId),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toDelete = [report, ...links].map(doc => ({
    _id: doc._id,
    _rev: (doc as any)._rev,
    _deleted: true as const,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.bulkDocs(toDelete as any[]);
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
  const items = result.docs as unknown as QueueItem[];
  // Sort by priority (ascending), then by creation time for stable tie-breaking
  return items.sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : a.createdAt.localeCompare(b.createdAt),
  );
}

// --- Reference helpers ---

export async function findReferenceByUrl(
  projectId: string,
  url: string
): Promise<Reference | null> {
  const result = await db.find({
    selector: { type: 'reference', projectId, url },
    limit: 1,
  });
  return (result.docs[0] as unknown as Reference) || null;
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

// --- Export / Import ---

export async function exportDocs(): Promise<string> {
  const result = await db.allDocs({ include_docs: true });
  const docs = result.rows
    .map(r => r.doc)
    .filter(d => d && !d._id.startsWith('_design/'));
  return JSON.stringify(docs, null, 2);
}

export async function importDocs(
  json: string
): Promise<{ imported: number; errors: number }> {
  const docs = JSON.parse(json);
  // new_edits:false = true replication — preserves _id/_rev, no duplicates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await (db as any).bulkDocs(docs, { new_edits: false });
  const errors = results.filter((r: { error?: boolean }) => r.error).length;
  return { imported: results.length - errors, errors };
}

export { db };
