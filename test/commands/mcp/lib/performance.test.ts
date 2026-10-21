import { describe, expect, it } from 'vitest';
import { paginate } from '../../../../src/commands/mcp/lib/performance';

describe('MCP Performance', () => {
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
      const result = paginate(items, { pageSize: 200 });
      expect(result.pagination.pageSize).toBe(100);
    });

    it('should handle empty arrays', () => {
      const result = paginate([]);
      expect(result.data).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });
});
