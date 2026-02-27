import { db } from './index';

const CLEANUP_KEY = 'research-workspace-cleanup-v1';

/**
 * One-time cleanup: remove all seed/dummy data.
 * Keeps projects and any reports the user actually generated.
 */
export async function seedIfEmpty() {
  if (localStorage.getItem(CLEANUP_KEY)) return;

  try {
    const all = await db.allDocs({ include_docs: true });

    const toDelete: { _id: string; _rev: string; _deleted: true }[] = [];

    for (const row of all.rows) {
      if (!row.doc) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = row.doc as any;
      const type = doc.type as string | undefined;

      // Remove all dummy content types (features not yet built)
      if (type && ['note', 'chat', 'reference', 'queue-item', 'link'].includes(type)) {
        toDelete.push({ _id: row.id, _rev: doc._rev, _deleted: true });
        continue;
      }

      // Remove the seed report specifically
      if (
        type === 'report' &&
        typeof doc.title === 'string' &&
        doc.title.includes('Context Engineering: The Next Frontier')
      ) {
        toDelete.push({ _id: row.id, _rev: doc._rev, _deleted: true });
      }
    }

    if (toDelete.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.bulkDocs(toDelete as any[]);
      console.log(`Cleaned up ${toDelete.length} seed documents`);
    }
  } catch (err) {
    console.warn('Cleanup failed (non-fatal):', err);
  }

  localStorage.setItem(CLEANUP_KEY, 'true');
}
