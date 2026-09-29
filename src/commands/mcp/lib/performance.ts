import { LRUCache } from 'lru-cache';

import type { EvalSummary } from '../../../types/index';

/**
 * In-memory cache for evaluation results.
 */
export class EvaluationCache {
  private cache: LRUCache<string, EvalSummary[]>;

  constructor(maxSize: number = 100, ttlMs: number = 5 * 60 * 1000) {
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

export const evaluationCache = new EvaluationCache();
