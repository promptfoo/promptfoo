import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../../../src/ui/utils/RingBuffer';

describe('RingBuffer', () => {
  describe('constructor', () => {
    it('should create a buffer with the specified capacity', () => {
      const buffer = new RingBuffer<number>(10);
      expect(buffer.capacity).toBe(10);
      expect(buffer.size).toBe(0);
    });

    it('should throw an error for capacity < 1', () => {
      expect(() => new RingBuffer<number>(0)).toThrow('RingBuffer capacity must be at least 1');
      expect(() => new RingBuffer<number>(-1)).toThrow('RingBuffer capacity must be at least 1');
    });
  });

  describe('push', () => {
    it('should add items to the buffer', () => {
      const buffer = new RingBuffer<string>(5);
      buffer.push('a');
      buffer.push('b');
      expect(buffer.size).toBe(2);
      expect(buffer.toArray()).toEqual(['a', 'b']);
    });

    it('should overwrite oldest items when full', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Overwrites 1

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    it('should handle continuous overwrites', () => {
      const buffer = new RingBuffer<number>(2);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      expect(buffer.toArray()).toEqual([4, 5]);
    });
  });

  describe('pushAll', () => {
    it('should add multiple items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3]);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should handle overflow', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushAll([1, 2, 3, 4, 5]);
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });
  });

  describe('size and capacity', () => {
    it('should report correct size', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.size).toBe(0);
      buffer.push(1);
      expect(buffer.size).toBe(1);
      buffer.push(2);
      expect(buffer.size).toBe(2);
    });

    it('should not exceed capacity in size', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);
      expect(buffer.size).toBe(3);
      expect(buffer.capacity).toBe(3);
    });
  });

  describe('isEmpty and isFull', () => {
    it('should report isEmpty correctly', () => {
      const buffer = new RingBuffer<number>(3);
      expect(buffer.isEmpty).toBe(true);
      buffer.push(1);
      expect(buffer.isEmpty).toBe(false);
    });

    it('should report isFull correctly', () => {
      const buffer = new RingBuffer<number>(2);
      expect(buffer.isFull).toBe(false);
      buffer.push(1);
      expect(buffer.isFull).toBe(false);
      buffer.push(2);
      expect(buffer.isFull).toBe(true);
      buffer.push(3);
      expect(buffer.isFull).toBe(true);
    });
  });

  describe('get', () => {
    it('should get items by index (0 = oldest)', () => {
      const buffer = new RingBuffer<string>(5);
      buffer.push('a');
      buffer.push('b');
      buffer.push('c');

      expect(buffer.get(0)).toBe('a');
      expect(buffer.get(1)).toBe('b');
      expect(buffer.get(2)).toBe('c');
    });

    it('should return undefined for out of bounds', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);

      expect(buffer.get(-1)).toBeUndefined();
      expect(buffer.get(2)).toBeUndefined();
      expect(buffer.get(100)).toBeUndefined();
    });

    it('should work correctly after overflow', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);

      expect(buffer.get(0)).toBe(2); // 1 was overwritten
      expect(buffer.get(1)).toBe(3);
      expect(buffer.get(2)).toBe(4);
    });
  });

  describe('newest and oldest', () => {
    it('should return newest item', () => {
      const buffer = new RingBuffer<string>(5);
      buffer.push('a');
      buffer.push('b');
      buffer.push('c');
      expect(buffer.newest()).toBe('c');
    });

    it('should return oldest item', () => {
      const buffer = new RingBuffer<string>(5);
      buffer.push('a');
      buffer.push('b');
      buffer.push('c');
      expect(buffer.oldest()).toBe('a');
    });

    it('should return undefined when empty', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.newest()).toBeUndefined();
      expect(buffer.oldest()).toBeUndefined();
    });

    it('should work correctly after overflow', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      expect(buffer.oldest()).toBe(3);
      expect(buffer.newest()).toBe(5);
    });
  });

  describe('toArray', () => {
    it('should return empty array for empty buffer', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.toArray()).toEqual([]);
    });

    it('should return items in order (oldest to newest)', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should return correct order after overflow', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });
  });

  describe('last', () => {
    it('should return last N items', () => {
      const buffer = new RingBuffer<number>(10);
      buffer.pushAll([1, 2, 3, 4, 5]);

      expect(buffer.last(3)).toEqual([3, 4, 5]);
      expect(buffer.last(1)).toEqual([5]);
      expect(buffer.last(5)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return all items if N > size', () => {
      const buffer = new RingBuffer<number>(10);
      buffer.push(1);
      buffer.push(2);

      expect(buffer.last(10)).toEqual([1, 2]);
    });

    it('should return empty array for N = 0', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      expect(buffer.last(0)).toEqual([]);
    });

    it('should work after overflow', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushAll([1, 2, 3, 4, 5]);

      expect(buffer.last(2)).toEqual([4, 5]);
    });
  });

  describe('clear', () => {
    it('should clear all items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3]);
      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.toArray()).toEqual([]);
    });

    it('should allow pushing after clear', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushAll([1, 2, 3]);
      buffer.clear();
      buffer.push(10);

      expect(buffer.toArray()).toEqual([10]);
    });
  });

  describe('iterator', () => {
    it('should iterate in order (oldest to newest)', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3]);

      const result: number[] = [];
      for (const item of buffer) {
        result.push(item);
      }

      expect(result).toEqual([1, 2, 3]);
    });

    it('should work with spread operator', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushAll([1, 2, 3, 4]);

      expect([...buffer]).toEqual([2, 3, 4]);
    });
  });

  describe('forEach', () => {
    it('should call function for each item', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3]);

      const items: number[] = [];
      const indices: number[] = [];
      buffer.forEach((item, index) => {
        items.push(item);
        indices.push(index);
      });

      expect(items).toEqual([1, 2, 3]);
      expect(indices).toEqual([0, 1, 2]);
    });
  });

  describe('find', () => {
    it('should find matching item', () => {
      const buffer = new RingBuffer<{ id: number; name: string }>(5);
      buffer.push({ id: 1, name: 'a' });
      buffer.push({ id: 2, name: 'b' });
      buffer.push({ id: 3, name: 'c' });

      const result = buffer.find((item) => item.id === 2);
      expect(result).toEqual({ id: 2, name: 'b' });
    });

    it('should return undefined if not found', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3]);

      expect(buffer.find((x) => x === 10)).toBeUndefined();
    });
  });

  describe('filter', () => {
    it('should filter items', () => {
      const buffer = new RingBuffer<number>(10);
      buffer.pushAll([1, 2, 3, 4, 5, 6]);

      const evens = buffer.filter((x) => x % 2 === 0);
      expect(evens).toEqual([2, 4, 6]);
    });
  });

  describe('map', () => {
    it('should map items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3]);

      const doubled = buffer.map((x) => x * 2);
      expect(doubled).toEqual([2, 4, 6]);
    });

    it('should provide index to map function', () => {
      const buffer = new RingBuffer<string>(5);
      buffer.pushAll(['a', 'b', 'c']);

      const result = buffer.map((item, index) => `${index}:${item}`);
      expect(result).toEqual(['0:a', '1:b', '2:c']);
    });
  });

  describe('edge cases', () => {
    it('should handle capacity of 1', () => {
      const buffer = new RingBuffer<number>(1);
      expect(buffer.capacity).toBe(1);

      buffer.push(1);
      expect(buffer.size).toBe(1);
      expect(buffer.toArray()).toEqual([1]);

      buffer.push(2);
      expect(buffer.size).toBe(1);
      expect(buffer.toArray()).toEqual([2]);
      expect(buffer.newest()).toBe(2);
      expect(buffer.oldest()).toBe(2);
    });

    it('should handle multiple complete wraparounds', () => {
      const buffer = new RingBuffer<number>(3);
      // First wraparound
      buffer.pushAll([1, 2, 3, 4, 5, 6]);
      expect(buffer.toArray()).toEqual([4, 5, 6]);

      // Second wraparound
      buffer.pushAll([7, 8, 9]);
      expect(buffer.toArray()).toEqual([7, 8, 9]);

      // Third wraparound
      buffer.pushAll([10, 11, 12]);
      expect(buffer.toArray()).toEqual([10, 11, 12]);
    });

    it('should handle exact capacity fill without overflow', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3, 4, 5]);

      expect(buffer.size).toBe(5);
      expect(buffer.isFull).toBe(true);
      expect(buffer.toArray()).toEqual([1, 2, 3, 4, 5]);
      expect(buffer.get(0)).toBe(1);
      expect(buffer.get(4)).toBe(5);
    });

    it('should handle clear and refill cycle', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushAll([1, 2, 3, 4]); // Overflow to [2, 3, 4]
      buffer.clear();

      expect(buffer.isEmpty).toBe(true);
      expect(buffer.size).toBe(0);

      // Refill should work correctly
      buffer.pushAll([10, 20]);
      expect(buffer.toArray()).toEqual([10, 20]);

      // Overflow should still work
      buffer.pushAll([30, 40]);
      expect(buffer.toArray()).toEqual([20, 30, 40]);
    });

    it('should handle null and undefined values', () => {
      const buffer = new RingBuffer<string | null | undefined>(5);
      buffer.push('a');
      buffer.push(null);
      buffer.push(undefined);
      buffer.push('b');

      expect(buffer.toArray()).toEqual(['a', null, undefined, 'b']);
      expect(buffer.get(1)).toBeNull();
      expect(buffer.get(2)).toBeUndefined();
    });

    it('should handle empty object values', () => {
      const buffer = new RingBuffer<object>(3);
      const obj1 = {};
      const obj2 = {};
      buffer.push(obj1);
      buffer.push(obj2);

      expect(buffer.get(0)).toBe(obj1);
      expect(buffer.get(1)).toBe(obj2);
    });

    it('should correctly report state after single item operations', () => {
      const buffer = new RingBuffer<number>(3);

      // Single push
      buffer.push(1);
      expect(buffer.size).toBe(1);
      expect(buffer.isEmpty).toBe(false);
      expect(buffer.isFull).toBe(false);
      expect(buffer.newest()).toBe(1);
      expect(buffer.oldest()).toBe(1);
      expect(buffer.get(0)).toBe(1);
      expect(buffer.get(1)).toBeUndefined();
    });

    it('should handle negative index in get correctly', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3]);

      expect(buffer.get(-1)).toBeUndefined();
      expect(buffer.get(-100)).toBeUndefined();
    });

    it('should handle last() with various edge values', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushAll([1, 2, 3, 4, 5]);

      expect(buffer.last(-1)).toEqual([]);
      expect(buffer.last(0)).toEqual([]);
      expect(buffer.last(5)).toEqual([1, 2, 3, 4, 5]);
      expect(buffer.last(10)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should work with filter after overflow', () => {
      const buffer = new RingBuffer<number>(4);
      buffer.pushAll([1, 2, 3, 4, 5, 6]); // [3, 4, 5, 6]

      const evens = buffer.filter((x) => x % 2 === 0);
      expect(evens).toEqual([4, 6]);
    });

    it('should work with find after overflow', () => {
      const buffer = new RingBuffer<{ id: number }>(3);
      buffer.push({ id: 1 });
      buffer.push({ id: 2 });
      buffer.push({ id: 3 });
      buffer.push({ id: 4 }); // [{ id: 2 }, { id: 3 }, { id: 4 }]

      expect(buffer.find((x) => x.id === 1)).toBeUndefined();
      expect(buffer.find((x) => x.id === 3)).toEqual({ id: 3 });
    });

    it('should maintain order consistency through iterator after multiple overwrites', () => {
      const buffer = new RingBuffer<number>(3);

      // Multiple cycles of overwrite
      for (let i = 1; i <= 10; i++) {
        buffer.push(i);
      }

      // Should have [8, 9, 10]
      expect([...buffer]).toEqual([8, 9, 10]);
      expect(buffer.toArray()).toEqual([8, 9, 10]);
      expect(buffer.last(3)).toEqual([8, 9, 10]);
    });
  });
});
