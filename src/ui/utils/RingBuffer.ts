/**
 * RingBuffer - A fixed-size circular buffer with O(1) push operations.
 *
 * Used for log storage to avoid O(n) array copying on every push.
 * When the buffer is full, new items overwrite the oldest items.
 *
 * @example
 * ```typescript
 * const buffer = new RingBuffer<string>(100);
 * buffer.push('log 1');
 * buffer.push('log 2');
 * console.log(buffer.toArray()); // ['log 1', 'log 2']
 * console.log(buffer.size); // 2
 * ```
 */
export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0; // Next write position
  private count = 0; // Number of items in buffer
  private readonly maxSize: number;

  /**
   * Create a new ring buffer with the specified capacity.
   *
   * @param capacity Maximum number of items the buffer can hold
   */
  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error('RingBuffer capacity must be at least 1');
    }
    this.maxSize = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Add an item to the buffer. O(1) operation.
   * If buffer is full, overwrites the oldest item.
   *
   * @param item The item to add
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.maxSize;

    if (this.count < this.maxSize) {
      this.count++;
    }
  }

  /**
   * Add multiple items to the buffer.
   *
   * @param items The items to add
   */
  pushAll(items: T[]): void {
    for (const item of items) {
      this.push(item);
    }
  }

  /**
   * Get the number of items currently in the buffer.
   */
  get size(): number {
    return this.count;
  }

  /**
   * Get the maximum capacity of the buffer.
   */
  get capacity(): number {
    return this.maxSize;
  }

  /**
   * Check if the buffer is empty.
   */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if the buffer is at full capacity.
   */
  get isFull(): boolean {
    return this.count === this.maxSize;
  }

  /**
   * Get an item at a specific index (0 = oldest item).
   *
   * @param index The index to retrieve
   * @returns The item at the index, or undefined if out of bounds
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) {
      return undefined;
    }

    // Calculate actual position in buffer
    // If not full: start from 0
    // If full: start from head (which is where oldest item is)
    const start = this.count < this.maxSize ? 0 : this.head;
    const actualIndex = (start + index) % this.maxSize;
    return this.buffer[actualIndex];
  }

  /**
   * Get the most recent item (last pushed).
   *
   * @returns The newest item, or undefined if empty
   */
  newest(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }
    // head points to next write position, so newest is at head - 1
    const index = (this.head - 1 + this.maxSize) % this.maxSize;
    return this.buffer[index];
  }

  /**
   * Get the oldest item in the buffer.
   *
   * @returns The oldest item, or undefined if empty
   */
  oldest(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }
    return this.get(0);
  }

  /**
   * Convert buffer contents to an array (oldest to newest).
   * Creates a new array each time - use sparingly for performance.
   *
   * @returns Array of items from oldest to newest
   */
  toArray(): T[] {
    if (this.count === 0) {
      return [];
    }

    const result: T[] = [];
    const start = this.count < this.maxSize ? 0 : this.head;

    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % this.maxSize;
      result.push(this.buffer[index] as T);
    }

    return result;
  }

  /**
   * Get the last N items (most recent).
   *
   * @param n Number of items to retrieve
   * @returns Array of the last N items (or fewer if buffer has less)
   */
  last(n: number): T[] {
    const count = Math.min(n, this.count);
    if (count === 0) {
      return [];
    }

    const result: T[] = [];
    const start = this.count < this.maxSize ? 0 : this.head;
    const offset = this.count - count;

    for (let i = 0; i < count; i++) {
      const index = (start + offset + i) % this.maxSize;
      result.push(this.buffer[index] as T);
    }

    return result;
  }

  /**
   * Clear all items from the buffer.
   */
  clear(): void {
    this.buffer = new Array(this.maxSize);
    this.head = 0;
    this.count = 0;
  }

  /**
   * Iterate over buffer contents (oldest to newest).
   */
  *[Symbol.iterator](): Iterator<T> {
    const start = this.count < this.maxSize ? 0 : this.head;

    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % this.maxSize;
      yield this.buffer[index] as T;
    }
  }

  /**
   * Apply a function to each item in the buffer.
   *
   * @param fn Function to apply to each item
   */
  forEach(fn: (item: T, index: number) => void): void {
    let i = 0;
    for (const item of this) {
      fn(item, i++);
    }
  }

  /**
   * Find an item in the buffer.
   *
   * @param predicate Function that returns true for the item to find
   * @returns The first matching item, or undefined
   */
  find(predicate: (item: T) => boolean): T | undefined {
    for (const item of this) {
      if (predicate(item)) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Filter items in the buffer.
   *
   * @param predicate Function that returns true for items to include
   * @returns Array of matching items
   */
  filter(predicate: (item: T) => boolean): T[] {
    const result: T[] = [];
    for (const item of this) {
      if (predicate(item)) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Map items in the buffer to a new array.
   *
   * @param fn Function to apply to each item
   * @returns Array of mapped items
   */
  map<U>(fn: (item: T, index: number) => U): U[] {
    const result: U[] = [];
    let i = 0;
    for (const item of this) {
      result.push(fn(item, i++));
    }
    return result;
  }
}
