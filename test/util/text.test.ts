import { describe, expect, it } from 'vitest';
import { ellipsize } from '../../src/util/text';

describe('ellipsize', () => {
  it('should not modify string shorter than maxLen', () => {
    const str = 'hello';
    expect(ellipsize(str, 10)).toBe('hello');
  });

  it('should truncate string and add ellipsis when longer than maxLen', () => {
    const str = 'hello world';
    expect(ellipsize(str, 8)).toBe('hello...');
  });

  it('should handle string equal to maxLen', () => {
    const str = 'hello';
    expect(ellipsize(str, 5)).toBe('hello');
  });

  it('should handle very short maxLen', () => {
    const str = 'hello';
    expect(ellipsize(str, 4)).toBe('h...');
  });

  it('should handle empty string', () => {
    expect(ellipsize('', 5)).toBe('');
  });

  it('should stay within maxLen when maxLen is too small for an ellipsis', () => {
    // maxLen < 3 has no room for "..."; the result must still respect maxLen
    // (previously slice(0, maxLen - 3) used a negative index and overflowed).
    expect(ellipsize('hello', 2)).toBe('he');
    expect(ellipsize('hello', 1)).toBe('h');
    expect(ellipsize('hello', 0)).toBe('');
    for (const maxLen of [0, 1, 2, 3]) {
      expect(ellipsize('hello', maxLen).length).toBeLessThanOrEqual(maxLen);
    }
  });
});
