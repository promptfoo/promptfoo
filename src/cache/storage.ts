import { EventEmitter } from 'node:events';

import { createCache } from 'cache-manager';
import { Keyv, KeyvBridgeAdapter } from 'keyv';
import { KeyvFile } from 'keyv-file';
import type { Cache } from 'cache-manager';
import type { KeyvValue } from 'keyv';

// The store getter is typed as any in Keyv 5; opts.store retains its adapter contract.
type CacheManagerStore = Cache['stores'][number]['opts']['store'];

function isEnvelope(value: unknown): value is KeyvValue<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (!('expires' in value) || value.expires === undefined || typeof value.expires === 'number')
  );
}

class DiskStore extends EventEmitter {
  readonly opts = {};
  // Keyv 5 assigns this field and prefixes keys itself. Do not forward it to Keyv 6.
  namespace?: string;

  constructor(private readonly backend: Keyv) {
    super();
  }

  async get<T>(key: string) {
    const raw = await this.backend.getRaw<T>(key);
    return typeof raw === 'string' ? this.backend.decode<T>(raw) : raw;
  }

  async set(key: string, value: unknown) {
    if (!isEnvelope(value)) {
      throw new TypeError('Cache storage requires a value/expiry envelope');
    }
    return this.backend.setRaw(key, value);
  }

  async delete(key: string) {
    return this.backend.delete(key);
  }

  async clear() {
    await this.backend.clear();
  }

  async disconnect() {
    await this.backend.disconnect();
  }
}

/** Preserve cache-manager's Keyv 5 API while storing data through Keyv 6. */
export function createDiskCache(filename: string, ttl: number): Cache {
  const backend = new Keyv(new KeyvBridgeAdapter(new KeyvFile({ filename })));
  const cache = createCache({ ttl, refreshThreshold: 0 });
  const facade = cache.stores[0];
  const store = new DiskStore(backend) satisfies CacheManagerStore;

  // createCache disables facade serialization. Keyv 6 serializes its one raw envelope,
  // preserving existing keyv: keys, absolute expiry and the KeyvFile disk format.
  facade.ttl = ttl;
  facade.store = store;
  facade.iterator = async function* () {
    const prefix = facade.useKeyPrefix && facade.namespace ? `${facade.namespace}:` : '';
    for await (const [key, value] of backend.iterator()) {
      if (!prefix || key.startsWith(prefix)) {
        yield [prefix ? key.slice(prefix.length) : key, value];
      }
    }
  };

  // Keep backend errors rejecting into the facade's existing read/write fallbacks.
  // A nonthrowing Keyv 6 error listener would also hide failed namespace iteration.
  return cache;
}
