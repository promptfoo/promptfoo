import { LRUCache } from 'lru-cache';

/**
 * Performance utilities for MCP server operations
 */

/**
 * Simple in-memory cache for evaluation results
 */
export class EvaluationCache {
  private cache: LRUCache<string, any>;

  constructor(maxSize: number = 100, ttlMs: number = 5 * 60 * 1000) {
    // 5 minutes default
    this.cache = new LRUCache({
      max: maxSize,
      ttl: ttlMs,
    });
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
    };
  }
}

/**
 * Pagination helper for large result sets
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  maxPageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export function paginate<T>(items: T[], options: PaginationOptions = {}): PaginatedResult<T> {
  const { page = 1, pageSize = 20, maxPageSize = 100 } = options;

  // Validate and constrain parameters
  const validPageSize = Math.min(Math.max(1, pageSize), maxPageSize);
  const validPage = Math.max(1, page);

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / validPageSize);
  const startIndex = (validPage - 1) * validPageSize;
  const endIndex = startIndex + validPageSize;

  return {
    data: items.slice(startIndex, endIndex),
    pagination: {
      page: validPage,
      pageSize: validPageSize,
      totalItems,
      totalPages,
      hasNextPage: validPage < totalPages,
      hasPreviousPage: validPage > 1,
    },
  };
}

/**
 * Batch processor for handling multiple operations efficiently
 */
export class BatchProcessor<T, R> {
  private queue: Array<{ item: T; resolve: (value: R) => void; reject: (error: any) => void }> = [];
  private processing = false;

  constructor(
    private processor: (batch: T[]) => Promise<R[]>,
    private batchSize: number = 10,
    private delayMs: number = 100,
  ) {}

  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    // Wait for more items or process immediately if batch is full
    if (this.queue.length < this.batchSize) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    // Process batch
    const batch = this.queue.splice(0, this.batchSize);
    const items = batch.map((b) => b.item);

    try {
      const results = await this.processor(items);
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (error) {
      batch.forEach((b) => b.reject(error));
    }

    this.processing = false;

    // Continue processing if more items
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }
}

/**
 * Stream processor for handling large datasets
 */
export async function* streamProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5,
): AsyncGenerator<R, void, unknown> {
  const executing: Promise<R>[] = [];

  for (const item of items) {
    const promise = processor(item);
    executing.push(promise);

    if (executing.length >= concurrency) {
      yield await Promise.race(executing);
      const index = executing.findIndex((p) => p === promise);
      executing.splice(index, 1);
    }
  }

  // Yield remaining results
  while (executing.length > 0) {
    yield await Promise.race(executing);
    executing.shift();
  }
}

/**
 * Default cache instances
 */
export const evaluationCache = new EvaluationCache();
export const configCache = new EvaluationCache(50, 10 * 60 * 1000); // 10 minutes for configs
