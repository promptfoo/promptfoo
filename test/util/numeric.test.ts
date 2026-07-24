import { describe, expect, it } from 'vitest';
import { filterFiniteScores } from '../../src/util/numeric';

describe('filterFiniteScores', () => {
  it('preserves finite own keys without prototype mutation', () => {
    const scores = JSON.parse('{"__proto__":3,"constructor":2,"invalid":"1"}') as Record<
      string,
      unknown
    >;

    const filtered = filterFiniteScores(scores);

    expect(Object.keys(filtered)).toEqual(['__proto__', 'constructor']);
    expect(Object.getOwnPropertyDescriptor(filtered, '__proto__')?.value).toBe(3);
    expect(filtered.constructor).toBe(2);
    expect(Object.getPrototypeOf(filtered)).toBe(Object.prototype);
  });
});
