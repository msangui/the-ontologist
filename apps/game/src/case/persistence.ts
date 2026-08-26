import { openDB, type IDBPDatabase } from 'idb';
import type { CaseSnapshot } from './session';

/**
 * IndexedDB persistence via idb (#62): versioned DB, autosave slot.
 * All failures are swallowed into console warnings — storage problems must
 * never break play (§18.1: no dependency on anything for core play).
 */

const DB_NAME = 'the-ontologist';
const DB_VERSION = 1;
const STORE = 'saves';
const AUTOSAVE_KEY = 'autosave';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    },
  });
  return dbPromise;
}

export async function saveAutosave(snapshot: CaseSnapshot): Promise<boolean> {
  try {
    await (await db()).put(STORE, snapshot, AUTOSAVE_KEY);
    return true;
  } catch (error) {
    console.warn('Autosave failed (play continues):', error);
    return false;
  }
}

export async function loadAutosave(): Promise<unknown | null> {
  try {
    return (await (await db()).get(STORE, AUTOSAVE_KEY)) ?? null;
  } catch (error) {
    console.warn('Autosave load failed (starting fresh):', error);
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    await (await db()).delete(STORE, AUTOSAVE_KEY);
  } catch (error) {
    console.warn('Autosave clear failed:', error);
  }
}
