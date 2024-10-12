import type { Cache as GatewayCache } from '@adaline/gateway';

import { getCache } from './cache';

export class GatewayCachePlugin<T> implements GatewayCache<T> {
    
    async get(key: string): Promise<T | undefined> {
        const cache = await getCache();
        return cache.get(key);
    }

    async set(key: string, value: T): Promise<void> {
        const cache = await getCache();
        cache.set(key, value);
    }

    // Gateway will never invoke this method
    async delete(key: string): Promise<void> {
        throw new Error('Not implemented');
    }

    // Gateway will never invoke this method
    async clear(): Promise<void> {
        throw new Error('Not implemented');
    }
};
