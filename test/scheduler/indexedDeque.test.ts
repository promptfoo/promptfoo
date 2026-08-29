import { describe, expect, it } from 'vitest';
import { IndexedDeque } from '../../src/scheduler/slotQueue';

describe('IndexedDeque', () => {
  it('should initialize with length 0 and return undefined on empty shift', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    expect(deque.length).toBe(0);
    expect(deque.shift()).toBeUndefined();
  });

  it('should push and shift elements in strict FIFO order', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    deque.push({ id: 'a', val: 1 });
    deque.push({ id: 'b', val: 2 });
    deque.push({ id: 'c', val: 3 });

    expect(deque.length).toBe(3);

    expect(deque.shift()).toEqual({ id: 'a', val: 1 });
    expect(deque.length).toBe(2);

    expect(deque.shift()).toEqual({ id: 'b', val: 2 });
    expect(deque.length).toBe(1);

    expect(deque.shift()).toEqual({ id: 'c', val: 3 });
    expect(deque.length).toBe(0);

    expect(deque.shift()).toBeUndefined();
    expect(deque.length).toBe(0);
  });

  it('should remove elements from the middle correctly', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    deque.push({ id: 'a', val: 1 });
    deque.push({ id: 'b', val: 2 });
    deque.push({ id: 'c', val: 3 });

    const removed = deque.remove('b');
    expect(removed).toEqual({ id: 'b', val: 2 });
    expect(deque.length).toBe(2);

    // Remaining items should preserve FIFO order
    expect(deque.shift()).toEqual({ id: 'a', val: 1 });
    expect(deque.shift()).toEqual({ id: 'c', val: 3 });
    expect(deque.shift()).toBeUndefined();
  });

  it('should remove the head element correctly via remove(id)', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    deque.push({ id: 'a', val: 1 });
    deque.push({ id: 'b', val: 2 });

    const removed = deque.remove('a');
    expect(removed).toEqual({ id: 'a', val: 1 });
    expect(deque.length).toBe(1);

    expect(deque.shift()).toEqual({ id: 'b', val: 2 });
    expect(deque.length).toBe(0);
  });

  it('should remove the tail element correctly via remove(id)', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    deque.push({ id: 'a', val: 1 });
    deque.push({ id: 'b', val: 2 });

    const removed = deque.remove('b');
    expect(removed).toEqual({ id: 'b', val: 2 });
    expect(deque.length).toBe(1);

    // Can still push to new tail
    deque.push({ id: 'c', val: 3 });
    expect(deque.length).toBe(2);

    expect(deque.shift()).toEqual({ id: 'a', val: 1 });
    expect(deque.shift()).toEqual({ id: 'c', val: 3 });
  });

  it('should return undefined when removing non-existent id', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    deque.push({ id: 'a', val: 1 });

    expect(deque.remove('non-existent')).toBeUndefined();
    expect(deque.length).toBe(1);
  });

  it('should handle removing the only element in the deque', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    deque.push({ id: 'a', val: 1 });

    expect(deque.remove('a')).toEqual({ id: 'a', val: 1 });
    expect(deque.length).toBe(0);
    expect(deque.shift()).toBeUndefined();

    // Verify it can still accept new pushes cleanly
    deque.push({ id: 'b', val: 2 });
    expect(deque.length).toBe(1);
    expect(deque.shift()).toEqual({ id: 'b', val: 2 });
  });

  it('should drain all elements and reset size', () => {
    const deque = new IndexedDeque<{ id: string; val: number }>();
    deque.push({ id: 'a', val: 1 });
    deque.push({ id: 'b', val: 2 });
    deque.push({ id: 'c', val: 3 });

    const drained = deque.drain();
    expect(drained).toEqual([
      { id: 'a', val: 1 },
      { id: 'b', val: 2 },
      { id: 'c', val: 3 },
    ]);
    expect(deque.length).toBe(0);
    expect(deque.shift()).toBeUndefined();
    expect(deque.remove('a')).toBeUndefined();
  });
});

