import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMathJs } from '../src/evaluatorHelpers';

afterEach(() => {
  vi.doUnmock('mathjs');
  vi.resetModules();
});

describe('derived metric Math.js loading', () => {
  it('explains local and global installation when the package cannot load', async () => {
    vi.doMock('mathjs', () => {
      throw new Error('Cannot find package mathjs');
    });

    await expect(loadMathJs()).rejects.toThrow('npm install promptfoo mathjs@^15.1.1');
    await expect(loadMathJs()).rejects.toThrow('npm install -g promptfoo mathjs@^15.1.1');
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
