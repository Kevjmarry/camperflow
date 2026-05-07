import type { ChecklistInstanceType, ChecklistItemType } from '@/app/[locale]/staff/checklists/[id]/types';

const DB_NAME = 'camperflow-offline';
const DB_VERSION = 1;
const STORE = 'checklist_snapshots';

export type ChecklistSnapshot = {
  instanceId: string;
  cachedAt: string;
  instance: ChecklistInstanceType;
  items: ChecklistItemType[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'instanceId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveChecklistSnapshot(
  instance: ChecklistInstanceType,
  items: ChecklistItemType[],
): Promise<void> {
  try {
    const db = await openDb();
    const snapshot: ChecklistSnapshot = {
      instanceId: instance.id,
      cachedAt: new Date().toISOString(),
      instance,
      items,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(snapshot);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Non-fatal — online path continues regardless
  }
}

export async function loadChecklistSnapshot(
  instanceId: string,
): Promise<ChecklistSnapshot | null> {
  try {
    const db = await openDb();
    return await new Promise<ChecklistSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(instanceId);
      req.onsuccess = () => resolve((req.result as ChecklistSnapshot) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
