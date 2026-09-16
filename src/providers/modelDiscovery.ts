const SUCCESS_TTL_MS = 5 * 60 * 1000;
const ERROR_RETRY_MS = 5 * 1000;
const MAX_ENTRIES = 100;

interface DiscoveryEntry<T> {
  models: T[];
  expiresAt: number;
  pending?: Promise<T[]>;
}

/** Short-lived discovery state only; inference responses use the normal provider cache. */
export function createModelDiscoveryCache<T>(isCacheEnabled: () => boolean) {
  const entries = new Map<string, DiscoveryEntry<T>>();

  return {
    clear() {
      entries.clear();
    },
    async get(key: string, load: () => Promise<T[]>): Promise<T[]> {
      if (!isCacheEnabled()) {
        return load();
      }
      const now = Date.now();
      for (const [entryKey, entry] of entries) {
        if (!entry.pending && entry.expiresAt <= now) {
          entries.delete(entryKey);
        }
      }
      const cached = entries.get(key);
      if (cached) {
        return cached.pending ?? cached.models;
      }
      // Bound retained account identities, including entries waiting for a response.
      if (entries.size >= MAX_ENTRIES) {
        entries.delete(entries.keys().next().value!);
      }
      const entry: DiscoveryEntry<T> = { models: [], expiresAt: 0 };
      entries.set(key, entry);
      entry.pending = Promise.resolve()
        .then(load)
        .then((models) => {
          entry.models = models;
          entry.expiresAt = Date.now() + SUCCESS_TTL_MS;
          return models;
        })
        .catch((err) => {
          // A failed request is not a successful empty catalogue. Retry shortly.
          entry.expiresAt = Date.now() + ERROR_RETRY_MS;
          throw err;
        })
        .finally(() => {
          entry.pending = undefined;
        });
      return entry.pending;
    },
  };
}
