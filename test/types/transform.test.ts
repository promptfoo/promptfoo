import { describe, expect, it } from 'vitest';
import { isTransformFunction } from '../../src/types/transform';

describe('isTransformFunction', () => {
  it('returns true for functions', () => {
    expect(isTransformFunction(() => 'transformed')).toBe(true);
  });

  it('returns false for non-functions', () => {
    expect(isTransformFunction('output.trim()')).toBe(false);
    expect(isTransformFunction(null)).toBe(false);
    expect(isTransformFunction({ transform: () => 'transformed' })).toBe(false);
  });
});
