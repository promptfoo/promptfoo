import type { Cache } from 'cache-manager';

const scopes = new WeakMap<
  Cache,
  {
    backing: Cache;
    getKey: (key: string) => string;
    getGeneration: (key: string) => number;
    isClearing: (key: string) => boolean;
  }
>();

const noClears = () => 0;
const notClearing = () => false;

export function registerCacheOperationScope(
  cache: Cache,
  backing: Cache,
  getKey: (key: string) => string,
  getGeneration: (key: string) => number,
  isClearing: (key: string) => boolean,
) {
  scopes.set(cache, { backing, getKey, getGeneration, isClearing });
}

export function getCacheOperationScope(cache: Cache, key: string) {
  const scope = scopes.get(cache);
  return scope
    ? {
        cache: scope.backing,
        key: scope.getKey(key),
        getGeneration: () => scope.getGeneration(key),
        isClearing: () => scope.isClearing(key),
      }
    : { cache, key, getGeneration: noClears, isClearing: notClearing };
}
