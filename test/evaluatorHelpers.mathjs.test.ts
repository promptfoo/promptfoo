import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMathJs } from '../src/evaluatorHelpers';

afterEach(() => {
  vi.doUnmock('mathjs');
  vi.resetModules();
});

describe('derived metric Math.js loading', () => {
  it.each([
    new Error('Math.js initialization failed'),
    Object.assign(
      new Error("Cannot find package 'decimal.js' imported from /node_modules/mathjs"),
      {
        code: 'ERR_MODULE_NOT_FOUND',
      },
    ),
  ])('preserves unexpected package loading errors: %s', async (error) => {
    vi.doMock('mathjs', () => {
      throw error;
    });

    // Vitest wraps a failing mock factory with the original exception as its cause.
    await expect(loadMathJs()).rejects.toHaveProperty('cause', error);
  });

  it.each(['14.8.1', '16.0.0', 'invalid'])(
    'rejects incompatible version %s at use time',
    async (version) => {
      vi.doMock('mathjs', () => ({ version, evaluate: vi.fn() }));

      await expect(loadMathJs()).rejects.toThrow(`require mathjs@^15.1.1; found ${version}`);
    },
  );

  it('returns the compatible expression evaluator without wrapping its semantics', async () => {
    const evaluate = vi.fn();
    vi.doMock('mathjs', () => ({ version: '15.2.0', evaluate }));

    expect((await loadMathJs()).evaluate).toBe(evaluate);
    expect(evaluate).not.toHaveBeenCalled();
  });
});
