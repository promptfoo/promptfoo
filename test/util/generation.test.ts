import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryWithDeduplication, sampleArray } from '../../src/util/generation';

describe('retryWithDeduplication', () => {
  it('should collect unique items until target count is reached', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce([1, 2, 3])
      .mockResolvedValueOnce([3, 4, 5])
      .mockResolvedValueOnce([5, 6, 7]);

    const result = await retryWithDeduplication(operation, 5);

    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should stop after max consecutive retries', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([1, 2]);

    const result = await retryWithDeduplication(operation, 5, 2);

    expect(result).toEqual([1, 2]);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('should use custom deduplication function', async () => {
    const operation = vi
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
    const operation = vi
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([3]);

    const result = await retryWithDeduplication(operation, 3);

    expect(result).toEqual([1, 2, 3]);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should return all unique items even if target count is not reached', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([2, 3])
      .mockResolvedValueOnce([3, 4]);

    const result = await retryWithDeduplication(operation, 10, 2);

    expect(result).toEqual([1, 2, 3, 4]);
    expect(operation).toHaveBeenCalledTimes(6);
  });
});

describe('sampleArray', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return n random items when n is less than array length', () => {
    const array = [1, 2, 3, 4, 5];
    const result = sampleArray(array, 3);

    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3); // All items are unique
    result.forEach((item) => expect(array).toContain(item));
  });

  it('should return all items when n is equal to array length', () => {
    const array = [1, 2, 3, 4, 5];
    const result = sampleArray(array, 5);

    expect(result).toHaveLength(5);
    expect(new Set(result).size).toBe(5);
    expect(result).toEqual(expect.arrayContaining(array));
  });

  it('should return all items when n is greater than array length', () => {
    const array = [1, 2, 3];
    const result = sampleArray(array, 5);

    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining(array));
  });

  it('should return an empty array when input array is empty', () => {
    const result = sampleArray([], 3);
    expect(result).toEqual([]);
  });

  it('should return a new array, not modifying the original', () => {
    const array = [1, 2, 3, 4, 5];
    const originalArray = [...array];
    sampleArray(array, 3);

    expect(array).toEqual(originalArray);
  });

  it('samples every ordered pair equally across the random choices', () => {
    const random = vi.spyOn(Math, 'random');
    const samples: string[] = [];

    for (const first of [1 / 6, 1 / 2, 5 / 6]) {
      for (const second of [1 / 4, 3 / 4]) {
        random
          .mockReset()
          .mockReturnValue(0.5)
          .mockReturnValueOnce(first)
          .mockReturnValueOnce(second);
        samples.push(sampleArray(['a', 'b', 'c'], 2).join(''));
      }
    }

    expect(samples.sort()).toEqual(['ab', 'ac', 'ba', 'bc', 'ca', 'cb']);
  });
});
