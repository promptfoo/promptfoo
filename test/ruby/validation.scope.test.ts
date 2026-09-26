import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { validateRubyPath } from '../../src/ruby/rubyUtils';
import { createDeferred } from '../util/utils';

const { execFileAsync, execFile } = vi.hoisted(() => {
  const execFileAsync = vi.fn();
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: execFileAsync,
  });
  return { execFileAsync, execFile };
});

vi.mock('child_process', () => ({ execFile }));
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('Ruby validation within an environment invocation', () => {
  beforeEach(() => {
    execFileAsync.mockReset();
    execFileAsync.mockResolvedValue({ stdout: 'ruby 3.3.0', stderr: '' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares one probe across concurrent and later calls in the same invocation', async () => {
    const release = createDeferred<void>();
    execFileAsync.mockImplementation(async () => {
      await release.promise;
      return { stdout: 'ruby 3.3.0', stderr: '' };
    });

    await cliState.withEnv(undefined, async () => {
      const first = validateRubyPath('ruby', true);
      const second = validateRubyPath('ruby', true);
      expect(execFileAsync).toHaveBeenCalledTimes(1);
      release.resolve();
      expect(await Promise.all([first, second])).toEqual(['ruby', 'ruby']);
      expect(await validateRubyPath('ruby', true)).toBe('ruby');
      expect(execFileAsync).toHaveBeenCalledTimes(1);
    });
  });

  it.each([undefined, { PROMPTFOO_RUBY: 'ruby' }])(
    'validates independently when separate invocations reuse the same env: %j',
    async (env) => {
      await Promise.all([
        cliState.withEnv(env, () => validateRubyPath('ruby', true)),
        cliState.withEnv(env, () => validateRubyPath('ruby', true)),
      ]);
      expect(execFileAsync).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps different executables independent within an invocation', async () => {
    await cliState.withEnv(undefined, async () => {
      expect(await validateRubyPath('first', true)).toBe('first');
      expect(await validateRubyPath('second', true)).toBe('second');
    });
    expect(execFileAsync).toHaveBeenCalledTimes(2);
  });

  it('does not reuse an implicit fallback for an explicit request', async () => {
    execFileAsync.mockImplementation(async (_command, args) => {
      if (args[0] === '--version') {
        throw new Error('Executable missing');
      }
      return { stdout: '/fixture/fallback', stderr: '' };
    });

    await cliState.withEnv(undefined, async () => {
      expect(await validateRubyPath('missing', false)).toBe('/fixture/fallback');
      await expect(validateRubyPath('missing', true)).rejects.toThrow('not found');
    });
  });

  it('retries after a failed validation within the same invocation', async () => {
    execFileAsync.mockRejectedValueOnce(new Error('Executable missing'));
    await cliState.withEnv(undefined, async () => {
      await expect(validateRubyPath('ruby', true)).rejects.toThrow('not found');
      expect(await validateRubyPath('ruby', true)).toBe('ruby');
    });
    expect(execFileAsync).toHaveBeenCalledTimes(2);
  });

  it('does not retain validation outside an invocation', async () => {
    expect(await validateRubyPath('ruby', true)).toBe('ruby');
    execFileAsync.mockRejectedValueOnce(new Error('Executable missing'));
    await expect(validateRubyPath('ruby', true)).rejects.toThrow('not found');
    expect(execFileAsync).toHaveBeenCalledTimes(2);
  });
});
