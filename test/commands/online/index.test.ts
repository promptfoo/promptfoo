import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCapture } from '../../../src/commands/online/capture';
import { onlineCommand } from '../../../src/commands/online/index';
import { runOnlineWorker } from '../../../src/commands/online/worker';
import logger from '../../../src/logger';

vi.mock('../../../src/commands/online/capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/commands/online/capture')>()),
  runCapture: vi.fn(),
}));
vi.mock('../../../src/commands/online/worker', () => ({ runOnlineWorker: vi.fn() }));
vi.mock('../../../src/logger');

let originalExitCode: typeof process.exitCode;
beforeEach(() => {
  vi.resetAllMocks();
  originalExitCode = process.exitCode;
});
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});
async function run(args: string[]) {
  const program = new Command().exitOverride();
  onlineCommand(program);
  await program.parseAsync(['online', ...args], { from: 'user' });
}

describe('online commands', () => {
  it.each([undefined, '{"type":"agent-turn-complete"}'])(
    'forwards capture arguments %s',
    async (payload) => {
      const args = ['capture', '--agent', 'codex', '--dir', '/private/queue'];
      await run([...args, ...(payload === undefined ? [] : [payload])]);
      expect(runCapture).toHaveBeenCalledWith(
        args.slice(1).concat(payload === undefined ? [] : [payload]),
      );
    },
  );

  it('forwards watch options and removes signal listeners after shutdown', async () => {
    const before = process.listeners('SIGINT');
    const termBefore = process.listeners('SIGTERM');
    vi.mocked(runOnlineWorker).mockImplementation(async ({ signal }) => {
      expect(signal?.aborted).toBe(false);
      const stop = process.listeners('SIGINT').find((listener) => !before.includes(listener));
      expect(stop).toBeDefined();
      stop!('SIGINT');
      expect(signal?.aborted).toBe(true);
    });
    await run([
      'watch',
      '-c',
      'grading.yaml',
      '--dir',
      'queue',
      '--once',
      '--retry-errors',
      '--interval',
      '250',
    ]);
    expect(runOnlineWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: 'queue',
        configPath: 'grading.yaml',
        once: true,
        retryErrors: true,
        interval: 250,
      }),
    );
    expect(process.listeners('SIGINT')).toEqual(before);
    expect(process.listeners('SIGTERM')).toEqual(termBefore);
  });

  it.each(['invalid interval', 'worker failure'])(
    'reports %s and cleans up signal handlers',
    async (failure) => {
      const before = process.listeners('SIGINT');
      if (failure === 'worker failure') {
        vi.mocked(runOnlineWorker).mockRejectedValue(new Error('locked'));
      }
      await run([
        'watch',
        '-c',
        'grading.yaml',
        ...(failure === 'invalid interval' ? ['--interval', '0'] : []),
      ]);
      expect(process.exitCode).toBe(1);
      expect(logger.error).toHaveBeenCalledWith('Online eval worker failed', expect.any(Object));
      expect(process.listeners('SIGINT')).toEqual(before);
      if (failure === 'invalid interval') {
        expect(runOnlineWorker).not.toHaveBeenCalled();
      }
    },
  );
});
