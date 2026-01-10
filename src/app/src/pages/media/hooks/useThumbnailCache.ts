/**
 * IndexedDB-based cache for video thumbnails.
 * Stores generated thumbnails to avoid regenerating them on every page load.
 */

const DB_NAME = 'promptfoo-media-cache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ThumbnailEntry {
  hash: string;
  dataUrl: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens the IndexedDB database, creating the object store if needed.
 */
function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Gets a thumbnail from the cache by hash.
 * Returns null if not found or expired.
 */
export async function getThumbnail(hash: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry = request.result as ThumbnailEntry | undefined;
        if (entry) {
          // Check if expired
          if (Date.now() - entry.createdAt > MAX_AGE_MS) {
            // Clean up expired entry asynchronously
            deleteThumbnail(hash).catch(() => {});
            resolve(null);
          } else {
            resolve(entry.dataUrl);
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Stores a thumbnail in the cache.
 */
export async function setThumbnail(hash: string, dataUrl: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const entry: ThumbnailEntry = {
        hash,
        dataUrl,
        createdAt: Date.now(),
      };
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail - caching is optional
  }
}

/**
 * Deletes a thumbnail from the cache.
 */
export async function deleteThumbnail(hash: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(hash);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

/**
 * Clears all expired thumbnails from the cache.
 * Call this periodically to free up storage.
 */
export async function clearExpiredThumbnails(): Promise<void> {
  try {
    const db = await openDatabase();
    const cutoff = Date.now() - MAX_AGE_MS;

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('createdAt');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

/**
 * Gets the approximate size of the thumbnail cache in bytes.
 */
export async function getCacheSize(): Promise<number> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as ThumbnailEntry[];
        const size = entries.reduce((acc, entry) => acc + entry.dataUrl.length, 0);
        resolve(size);
      };

      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}
