import { LRUCache } from 'lru-cache';

import type { EvalSummary } from '../../../types/index';

/**
 * Performance utilities for MCP server operations
 */

/**
 * Pagination helper for large result sets
 */
export function paginate<T>(
  items: T[],
  options: {
    page?: number;
    pageSize?: number;
  } = {},
) {
  const { page = 1, pageSize = 20 } = options;

  // Validate and constrain parameters
  const validPageSize = Math.min(Math.max(1, pageSize), 100);
  const validPage = Math.max(1, page);

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / validPageSize);
  const startIndex = (validPage - 1) * validPageSize;

  return {
    data: items.slice(startIndex, startIndex + validPageSize),
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
 * Simple in-memory cache for evaluation results
 */

/**
 * Default cache instances
 */
export const evaluationCache = new LRUCache<string, EvalSummary[]>({
  max: 100,
  ttl: 5 * 60 * 1000, // 5 minutes default
});
