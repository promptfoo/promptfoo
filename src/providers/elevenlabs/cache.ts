import crypto from 'crypto';

import { getCache } from '../../cache';
import logger from '../../logger';

export interface CacheOptions {
  enabled: boolean;
  ttl?: number; // Time to live in seconds
  maxSize?: number; // Max cache size in bytes
}

/**
 * Cache wrapper for ElevenLabs API responses
 */
export class ElevenLabsCache {
  private enabled: boolean;
  private ttl: number;

  constructor(options: CacheOptions) {
    this.enabled = options.enabled;
    this.ttl = options.ttl || 3600; // 1 hour default
  }

  /**
   * Generate cache key from prefix and params
   */
  generateKey(prefix: string, params: any): string {
    const hash = crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex');
    return `elevenlabs:${prefix}:${hash}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) {
      return null;
    }

    const cache = getCache();
    const cached = await cache.get(key);

    if (cached) {
      logger.debug('[ElevenLabs Cache] Cache hit', { key });
      return cached as T;
    }

    logger.debug('[ElevenLabs Cache] Cache miss', { key });
    return null;
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, _size?: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const cache = getCache();

    // TTL is in milliseconds for cache-manager
    await cache.set(key, value, this.ttl * 1000);

    logger.debug('[ElevenLabs Cache] Cached value', { key, ttl: this.ttl });
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const cache = getCache();
    await cache.del(key);

    logger.debug('[ElevenLabs Cache] Deleted from cache', { key });
  }

  /**
   * Clear all cache entries with elevenlabs prefix
   */
  async clear(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const cache = getCache();
    await cache.clear();

    logger.debug('[ElevenLabs Cache] Cache cleared');
  }
}
