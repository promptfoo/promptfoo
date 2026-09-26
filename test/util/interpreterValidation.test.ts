import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, mockProcessEnv } from './utils';

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

describe.each(['Python', 'Ruby'] as const)('%s executable validation', (language) => {
  let validate: (executable: string, explicit: boolean) => Promise<string>;
  let cliState: typeof import('../../src/cliState').default;
  const version = language === 'Python' ? 'Python 3.12.0' : 'ruby 3.3.0';

  beforeEach(async () => {
    vi.resetModules();
    execFileAsync.mockReset();
    execFileAsync.mockResolvedValue({ stdout: version, stderr: '' });
    cliState = (await import('../../src/cliState')).default;
    validate =
      language === 'Python'
        ? (await import('../../src/python/pythonUtils')).validatePythonPath
        : (await import('../../src/ruby/rubyUtils')).validateRubyPath;
  });

  afterEach(() => {
    execFileAsync.mockReset();
    vi.restoreAllMocks();
  });

  it('validates each requested executable after a successful earlier call', async () => {
    expect(await validate('first', true)).toBe('first');
    expect(await validate('second', true)).toBe('second');
    execFileAsync.mockRejectedValue(new Error('Executable missing'));
    await expect(validate('missing', true)).rejects.toThrow('not found');
  });

  it('keeps later lookups correct after out-of-order concurrent completion', async () => {
    const release = createDeferred<void>();
    execFileAsync.mockImplementation(async (command) => {
      if (command === 'slow') {
        await release.promise;
      }
      return { stdout: version, stderr: '' };
    });
    const slow = validate('slow', true);
    const fast = validate('fast', true);
    await Promise.resolve();
    release.resolve();
    expect(await Promise.all([slow, fast])).toEqual(['slow', 'fast']);
    expect(await validate('fast', true)).toBe('fast');
  });

  it('does not reuse an implicit fallback for a later explicit request', async () => {
    execFileAsync.mockImplementation(async (_command, args) => {
      if (args[0] === '--version') {
        throw new Error('Executable missing');
      }
      return { stdout: '/fixture/fallback', stderr: '' };
    });
    expect(await validate('missing', false)).toBe('/fixture/fallback');
    await expect(validate('missing', true)).rejects.toThrow('not found');
  });

  it('keeps explicit validation independent from a concurrent fallback search', async () => {
    execFileAsync.mockImplementation(async (_command, args) => {
      if (args[0] === '--version') {
        throw new Error('Executable missing');
      }
      return { stdout: '/fixture/fallback', stderr: '' };
    });
    const implicit = validate('missing', false);
    const explicit = validate('missing', true);
    await expect(explicit).rejects.toThrow('not found');
    expect(await implicit).toBe('/fixture/fallback');
  });

  it('can retry after an earlier validation failure', async () => {
    execFileAsync.mockRejectedValueOnce(new Error('Executable missing'));
    await expect(validate('fixture', true)).rejects.toThrow('not found');
    expect(await validate('fixture', true)).toBe('fixture');
  });

  it('uses the current file environment for discovery without exporting suite values', async () => {
    const restore = mockProcessEnv({ PROMPTFOO_INTERPRETER_PROBE: 'host' });
    try {
      const check = (filePath: string) =>
        cliState.withEnvFileOverrides({ PATH: filePath, PROMPTFOO_INTERPRETER_PROBE: 'file' }, () =>
          cliState.withEnv({ PROMPTFOO_INTERPRETER_PROBE: 'suite' }, () =>
            validate('fixture', true),
          ),
        );
      await check('/fixture/first');
      await check('/fixture/second');
      expect(execFileAsync).toHaveBeenNthCalledWith(1, 'fixture', ['--version'], {
        env: expect.objectContaining({
          PATH: '/fixture/first',
          PROMPTFOO_INTERPRETER_PROBE: 'file',
        }),
      });
      expect(execFileAsync).toHaveBeenNthCalledWith(2, 'fixture', ['--version'], {
        env: expect.objectContaining({
          PATH: '/fixture/second',
          PROMPTFOO_INTERPRETER_PROBE: 'file',
        }),
      });
      expect(process.env.PROMPTFOO_INTERPRETER_PROBE).toBe('host');
    } finally {
      restore();
    }
  });
});
