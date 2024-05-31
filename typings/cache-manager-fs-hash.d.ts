/**
 * The typings from the upstream @types/cache-manager-fs-hash are incorrect for version 2
 * @see https://github.com/rolandstarke/node-cache-manager-fs-hash/tree/master
 */
declare module 'cache-manager-fs-hash' {
  import type { Store } from 'cache-manager';
  class DiskStore extends Store {
    constructor(options: { path: string; ttl?: number; zip?: boolean });
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, data: T, ttl?: Milliseconds): Promise<void>;
    del(key: string): Promise<void>;
    reset(): Promise<void>;
    mset(arguments_: Array<[string, unknown]>, ttl?: Milliseconds): Promise<void>;
    mget(...arguments_: string[]): Promise<unknown[]>;
    mdel(...arguments_: string[]): Promise<void>;
    keys(pattern?: string): Promise<string[]>;
    ttl(key: string): Promise<number>;
  }
}
