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
  private maxSize: number;
  private currentSize: number = 0;

  constructor(options: CacheOptions) {
    this.enabled = options.enabled;
    this.ttl = options.ttl || 3600; // 1 hour default
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
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
  async set(key: string, value: any, size?: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const cache = getCache();

    // Check size limits
    const valueSize = size || JSON.stringify(value).length;
    if (this.currentSize + valueSize > this.maxSize) {
      logger.warn('[ElevenLabs Cache] Cache size limit reached, not caching', {
        currentSize: this.currentSize,
        valueSize,
        maxSize: this.maxSize,
      });
      return;
    }

    await cache.set(key, value, { ttl: this.ttl });
    this.currentSize += valueSize;

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
    await cache.reset();
    this.currentSize = 0;

    logger.debug('[ElevenLabs Cache] Cache cleared');
  }
}
