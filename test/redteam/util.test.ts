import { retryWithDeduplication } from '../../src/redteam/util';

describe('retryWithDeduplication', () => {
  it('should collect unique items until target count is reached', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2, 3])
      .mockResolvedValueOnce([3, 4, 5])
      .mockResolvedValueOnce([5, 6, 7]);

    const result = await retryWithDeduplication(operation, 5);

    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should stop after max consecutive retries', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([1, 2]);

    const result = await retryWithDeduplication(operation, 5, 2);

    expect(result).toEqual([1, 2]);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('should use custom deduplication function', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 2 }, { id: 3 }]);

    const customDedupFn = (items: { id: number }[]) =>
      Array.from(new Set(items.map((item) => item.id))).map((id) => ({ id }));

    const result = await retryWithDeduplication(operation, 3, 2, customDedupFn);

    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should handle empty results from operation', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([3]);

    const result = await retryWithDeduplication(operation, 3);

    expect(result).toEqual([1, 2, 3]);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should return all unique items even if target count is not reached', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([2, 3])
      .mockResolvedValueOnce([3, 4]);

    const result = await retryWithDeduplication(operation, 10, 2);

    expect(result).toEqual([1, 2, 3, 4]);
    expect(operation).toHaveBeenCalledTimes(6);
  });
});
