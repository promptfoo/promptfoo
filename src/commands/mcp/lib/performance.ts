import { LRUCache } from 'lru-cache';

import type { EvalSummary } from '../../../types/index';

/**
 * Performance utilities for MCP server operations
 */

/**
 * Simple in-memory cache for evaluation results
 */
export class EvaluationCache {
  private cache: LRUCache<string, EvalSummary[]>;

  constructor(maxSize: number = 100, ttlMs: number = 5 * 60 * 1000) {
    // 5 minutes default
    this.cache = new LRUCache<string, EvalSummary[]>({
      max: maxSize,
      ttl: ttlMs,
    });
  }

  get(key: string) {
    return this.cache.get(key);
  }

  set(key: string, value: EvalSummary[]): void {
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
  private queue: Array<{ item: T; resolve: (value: R) => void; reject: (error: Error) => void }> =
    [];
  private processing = false;

  constructor(
    private processor: (batch: T[]) => Promise<R[]>,
    private batchSize: number = 10,
    private delayMs: number = 100,
  ) {}

  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      void this.processQueue();
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
      batch.forEach((b) => b.reject(error as Error));
    }

    this.processing = false;

    // Continue processing if more items
    if (this.queue.length > 0) {
      void this.processQueue();
    }
  }
}

/**
 * Stream processor for handling large datasets with controlled concurrency.
 * Yields results as they complete while maintaining the concurrency limit.
 */
export async function* streamProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5,
): AsyncGenerator<R, void, unknown> {
  // Use a Map to track promises and identify which one completed
  type WrappedResult = { result: R; id: number };
  const executing = new Map<number, Promise<WrappedResult>>();
  let nextId = 0;

  for (const item of items) {
    const id = nextId++;
    // Wrap the promise to include an identifier
    const wrappedPromise = processor(item).then((result) => ({ result, id }));
    executing.set(id, wrappedPromise);

    if (executing.size >= concurrency) {
      // Wait for one to complete and yield its result
      const { result, id: completedId } = await Promise.race(executing.values());
      executing.delete(completedId);
      yield result;
    }
  }

  // Yield remaining results as they complete
  while (executing.size > 0) {
    const { result, id: completedId } = await Promise.race(executing.values());
    executing.delete(completedId);
    yield result;
  }
}

/**
 * Default cache instances
 */
export const evaluationCache = new EvaluationCache();
export const configCache = new EvaluationCache(50, 10 * 60 * 1000); // 10 minutes for configs
