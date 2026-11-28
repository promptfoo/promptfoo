import type { Cache } from 'cache-manager';

type ClearState = { generation: number; active: number };
const clears = new WeakMap<Cache, Map<string, ClearState>>();
const aliases = new WeakMap<Cache, { cache: Cache; keyFor: (key: string) => string }>();
let generation = 0;

export function registerCacheNamespace(
  alias: Cache,
  cache: Cache,
  keyFor: (key: string) => string,
) {
  aliases.set(alias, { cache, keyFor });
}

/** Invalidate in-flight publications on both boundaries, even if a clear fails. */
export async function trackCacheClear<T>(cache: Cache, namespace: string, clear: () => Promise<T>) {
  let states = clears.get(cache);
  if (!states) {
    states = new Map();
    clears.set(cache, states);
  }
  const state = states.get(namespace) ?? { generation: 0, active: 0 };
  states.set(namespace, state);
  state.active++;
  state.generation = ++generation;
  try {
    return await clear();
  } finally {
    state.active--;
    state.generation = ++generation;
    // A global clear supersedes older namespace generations. Keep any overlapping clears.
    if (!namespace) {
      for (const [name, child] of states) {
        if (name && !child.active) {
          states.delete(name);
        }
      }
    }
  }
}

/** Match a physical key against the global clear and every enclosing namespace. */
function getClearState(cache: Cache, key: string) {
  const states = clears.get(cache);
  let generation = 0;
  let clearing = false;
  if (states) {
    for (let end = 0; end !== -1; end = key.indexOf(':', end + 1)) {
      const state = states.get(key.slice(0, end));
      if (state) {
        generation = Math.max(generation, state.generation);
        clearing ||= state.active > 0;
      }
    }
  }
  return { generation, clearing };
}

export function getCacheOperationScope(instance: Cache, localKey: string) {
  const alias = aliases.get(instance);
  const cache = alias?.cache ?? instance;
  const key = alias ? alias.keyFor(localKey) : localKey;
  return { cache, key, getState: () => getClearState(cache, key) };
}
