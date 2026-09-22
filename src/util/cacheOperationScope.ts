import type { Cache } from 'cache-manager';

const scopes = new WeakMap<
  Cache,
  { backing: Cache; getKey: (key: string) => string; getGeneration: (key: string) => number }
>();

const noClears = () => 0;

export function registerCacheOperationScope(
  cache: Cache,
  backing: Cache,
  getKey: (key: string) => string,
  getGeneration: (key: string) => number,
) {
  scopes.set(cache, { backing, getKey, getGeneration });
}

export function getCacheOperationScope(cache: Cache, key: string) {
  const scope = scopes.get(cache);
  return scope
    ? {
        cache: scope.backing,
        key: scope.getKey(key),
        getGeneration: () => scope.getGeneration(key),
      }
    : { cache, key, getGeneration: noClears };
}
