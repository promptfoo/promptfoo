import nodeModule from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMathJs } from '../src/evaluatorHelpers';

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return { ...actual, default: { ...actual, createRequire: vi.fn(actual.createRequire) } };
});

const requireMathJs = vi.fn();

beforeEach(() => {
  vi.mocked(nodeModule.createRequire).mockReturnValue(requireMathJs as unknown as NodeJS.Require);
});

afterEach(() => {
  requireMathJs.mockReset();
  vi.mocked(nodeModule.createRequire).mockRestore();
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
    requireMathJs.mockImplementation(() => {
      throw error;
    });

    await expect(loadMathJs()).rejects.toBe(error);
  });

  it.each(['14.8.1', '16.0.0', 'invalid'])(
    'rejects incompatible version %s at use time',
    async (version) => {
      requireMathJs.mockReturnValue({ version, evaluate: vi.fn() });

      await expect(loadMathJs()).rejects.toThrow(`require mathjs@^15.1.1; found ${version}`);
    },
  );

  it('returns the compatible expression evaluator without wrapping its semantics', async () => {
    const evaluate = vi.fn();
    requireMathJs.mockReturnValue({ version: '15.2.0', evaluate });

    expect((await loadMathJs()).evaluate).toBe(evaluate);
    expect(evaluate).not.toHaveBeenCalled();
  });
});
