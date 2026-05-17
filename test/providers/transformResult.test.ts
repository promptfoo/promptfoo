import { describe, expect, it } from 'vitest';
import { normalizeResponseTransformResult } from '../../src/providers/transformResult';

describe('normalizeResponseTransformResult', () => {
  it('should preserve provider responses', () => {
    expect(
      normalizeResponseTransformResult({ output: 'ok', metadata: { source: 'test' } }),
    ).toEqual({
      output: 'ok',
      metadata: { source: 'test' },
    });
  });

  it('should wrap non-response values as output', () => {
    expect(normalizeResponseTransformResult({ answer: 'ok' })).toEqual({
      output: { answer: 'ok' },
    });
    expect(normalizeResponseTransformResult(42)).toEqual({ output: 42 });
  });
});
