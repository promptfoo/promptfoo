import { describe, expect, it } from 'vitest';
import {
  BatchProcessor,
  EvaluationCache,
  paginate,
  streamProcess,
} from '../../../../src/commands/mcp/lib/performance';

import type { EvalSummary } from '../../../../src/types';

describe('MCP Performance', () => {
  describe('EvaluationCache', () => {
    const createMockEvalSummary = (id: string): EvalSummary => ({
      evalId: id,
      datasetId: null,
      createdAt: Date.now(),
      description: `Test evaluation ${id}`,
      numTests: 10,
      isRedteam: false,
      passRate: 0.9,
      label: `Eval ${id}`,
      providers: [{ id: 'provider1', label: 'Provider 1' }],
    });

    it('should store and retrieve values', () => {
      const cache = new EvaluationCache();
      const mockEvalSummaries = [createMockEvalSummary('eval1')];
      cache.set('key1', mockEvalSummaries);
      expect(cache.get('key1')).toEqual(mockEvalSummaries);
    });

    it('should return undefined for missing keys', () => {
      const cache = new EvaluationCache();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      const cache = new EvaluationCache();
      const mockEvalSummaries = [createMockEvalSummary('eval1')];
      cache.set('exists', mockEvalSummaries);
      expect(cache.has('exists')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = new EvaluationCache();
      const mockEvalSummaries1 = [createMockEvalSummary('eval1')];
      const mockEvalSummaries2 = [createMockEvalSummary('eval2')];
      cache.set('key1', mockEvalSummaries1);
      cache.set('key2', mockEvalSummaries2);
      cache.clear();
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });

    it('should return stats', () => {
      const cache = new EvaluationCache();
      const mockEvalSummaries = [createMockEvalSummary('eval1')];
      cache.set('key1', mockEvalSummaries);
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
    });
  });

  describe('paginate', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('should return first page by default', () => {
      const result = paginate(items);
      expect(result.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalItems).toBe(10);
    });

    it('should paginate with custom page size', () => {
      const result = paginate(items, { pageSize: 3 });
      expect(result.data).toEqual([1, 2, 3]);
      expect(result.pagination.totalPages).toBe(4);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });

    it('should return correct page', () => {
      const result = paginate(items, { page: 2, pageSize: 3 });
      expect(result.data).toEqual([4, 5, 6]);
      expect(result.pagination.hasPreviousPage).toBe(true);
      expect(result.pagination.hasNextPage).toBe(true);
    });

    it('should handle last page', () => {
      const result = paginate(items, { page: 4, pageSize: 3 });
      expect(result.data).toEqual([10]);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPreviousPage).toBe(true);
    });

    it('should constrain page size to max', () => {
      const result = paginate(items, { pageSize: 200, maxPageSize: 5 });
      expect(result.pagination.pageSize).toBe(5);
    });

    it('should handle empty arrays', () => {
      const result = paginate([]);
      expect(result.data).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('streamProcess', () => {
    it('should process all items', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = async (x: number) => x * 2;

      const results: number[] = [];
      for await (const result of streamProcess(items, processor, 2)) {
        results.push(result);
      }

      expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
    });

    it('should respect concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const items = [1, 2, 3, 4, 5, 6];
      const processor = async (x: number) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent--;
        return x;
      };

      const results: number[] = [];
      for await (const result of streamProcess(items, processor, 2)) {
        results.push(result);
      }

      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(results.length).toBe(6);
    });

    it('should yield results as they complete', async () => {
      const items = [1, 2, 3];
      // Item 2 completes fastest, then 3, then 1
      const delays: Record<number, number> = { 1: 30, 2: 5, 3: 15 };
      const processor = async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, delays[x]));
        return x;
      };

      const results: number[] = [];
      for await (const result of streamProcess(items, processor, 3)) {
        results.push(result);
      }

      // All items should be processed
      expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it('should handle empty input', async () => {
      const results: number[] = [];
      for await (const result of streamProcess([], async (x: number) => x)) {
        results.push(result);
      }
      expect(results).toEqual([]);
    });

    it('should handle single item', async () => {
      const results: number[] = [];
      for await (const result of streamProcess([42], async (x) => x * 2)) {
        results.push(result);
      }
      expect(results).toEqual([84]);
    });

    it('should properly track which promise completed', async () => {
      // This test verifies the fix for the bug where the wrong promise was removed
      const items = [1, 2, 3, 4, 5];
      const completionOrder: number[] = [];

      // Make items complete in reverse order
      const processor = async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, (6 - x) * 10));
        completionOrder.push(x);
        return x;
      };

      const results: number[] = [];
      for await (const result of streamProcess(items, processor, 3)) {
        results.push(result);
      }

      // All items should be yielded exactly once
      expect(results.length).toBe(5);
      expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('BatchProcessor', () => {
    it('should process items in batches', async () => {
      const processedBatches: number[][] = [];
      const processor = async (batch: number[]) => {
        processedBatches.push([...batch]);
        return batch.map((x) => x * 2);
      };

      const batchProcessor = new BatchProcessor(processor, 2, 10);

      const results = await Promise.all([
        batchProcessor.add(1),
        batchProcessor.add(2),
        batchProcessor.add(3),
      ]);

      // Results should be correct regardless of batching
      expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6]);
    });

    it('should handle single item', async () => {
      const processor = async (batch: number[]) => batch.map((x) => x * 2);
      const batchProcessor = new BatchProcessor(processor, 10, 5);

      const result = await batchProcessor.add(5);
      expect(result).toBe(10);
    });
  });
});
