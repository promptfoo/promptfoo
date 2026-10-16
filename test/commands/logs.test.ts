import { EventEmitter } from 'node:events';
import fsSync from 'fs';
import fs from 'fs/promises';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { logsCommand } from '../../src/commands/logs';
import logger from '../../src/logger';
import * as logsUtil from '../../src/util/logs';

vi.mock('fs/promises');
vi.mock('fs');
vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    send: vi.fn(),
  },
}));
vi.mock('../../src/cliState', () => ({
  default: {
    debugLogFile: undefined,
    errorLogFile: undefined,
  },
}));
vi.mock('../../src/util/logs', () => ({
  getLogDirectory: vi.fn().mockReturnValue('/home/user/.promptfoo/logs'),
  getLogFiles: vi.fn().mockResolvedValue([]),
  getLogFilesSync: vi.fn().mockReturnValue([]),
  findLogFile: vi.fn().mockReturnValue(null),
  formatFileSize: vi.fn((bytes: number) => `${bytes} B`),
  readLastLines: vi.fn().mockResolvedValue([]),
  readFirstLines: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/util/index', () => ({
  printBorder: vi.fn(),
}));
vi.mock('../../src/table', () => ({
  wrapTable: vi.fn().mockReturnValue('mocked table'),
}));

describe('logs command', () => {
  let program: Command;
  const mockFs = vi.mocked(fs);
  const mockLogsUtil = vi.mocked(logsUtil);
  const mockCliState = vi.mocked(cliState);

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    program.enablePositionalOptions(); // Required for passThroughOptions() in logs command
    logsCommand(program);
    process.exitCode = 0;

    // Reset cliState
    mockCliState.debugLogFile = undefined;
    mockCliState.errorLogFile = undefined;
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.exitCode = 0;
  });

  describe('following logs', () => {
    let stop: (() => void) | undefined;

    beforeEach(() => {
      vi.useFakeTimers();
      stop = undefined;
    });

    afterEach(() => {
      stop?.();
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    async function startFollowing(
      grep?: string,
      initialLines: string[] = [],
      terminated = true,
      initialBytes?: Buffer,
      appendDuringRead?: string,
      readLimit = Number.POSITIVE_INFINITY,
    ) {
      const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
      vi.mocked(fsSync.watch).mockReturnValue(watcher as unknown as fsSync.FSWatcher);
      mockLogsUtil.findLogFile.mockReturnValue('/fixture.log');
      let content =
        initialBytes ??
        Buffer.from(initialLines.join('\n') + (initialLines.length && terminated ? '\n' : ''));
      const initialSize = content.length;
      function setContent(next: Buffer) {
        content = next;
        mockFs.stat.mockResolvedValue({ size: content.length, mtime: new Date() } as fsSync.Stats);
        mockFs.open.mockResolvedValue({
          read: vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
            const bytesRead = content.copy(
              buffer,
              offset,
              position,
              position + Math.min(length, readLimit),
            );
            if (appendDuringRead !== undefined) {
              const appended = appendDuringRead;
              appendDuringRead = undefined;
              setContent(Buffer.concat([content, Buffer.from(appended)]));
            }
            return { bytesRead, buffer };
          }),
          close: vi.fn().mockResolvedValue(undefined),
        } as unknown as Awaited<ReturnType<typeof fs.open>>);
      }
      setContent(content);
      mockLogsUtil.readLastLines.mockResolvedValue(initialLines);
      const previous = new Set(process.listeners('SIGINT'));
      const following = program.parseAsync([
        'node',
        'test',
        'logs',
        'fixture.log',
        '--follow',
        '--no-color',
        ...(grep === undefined ? [] : ['--grep', grep]),
      ]);
      await vi.waitFor(() => expect(fsSync.watch).toHaveBeenCalledOnce());
      stop = process.listeners('SIGINT').find((listener) => !previous.has(listener)) as
        | (() => void)
        | undefined;
      expect(stop).toBeDefined();
      mockFs.open.mockClear();
      async function replace(next: string | Buffer, eventType = 'change') {
        setContent(Buffer.from(next));
        watcher.emit('change', eventType);
        await vi.advanceTimersByTimeAsync(100);
      }
      async function append(next: string | Buffer) {
        await replace(Buffer.concat([content, Buffer.from(next)]));
      }
      return { watcher, following, initialSize, append, replace };
    }

    it('coalesces file events and prints appended content once', async () => {
      const { watcher, following } = await startFollowing();
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const close = vi.fn().mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ size: 6 } as fsSync.Stats);
      mockFs.open.mockResolvedValue({
        read: vi.fn(async (buffer: Buffer) => {
          buffer.write('entry\n');
          return { bytesRead: 6, buffer };
        }),
        close,
      } as unknown as Awaited<ReturnType<typeof fs.open>>);
      watcher.emit('change');
      await vi.advanceTimersByTimeAsync(50);
      watcher.emit('change');
      await vi.advanceTimersByTimeAsync(100);
      expect(output).toHaveBeenCalledExactlyOnceWith('entry\n');
      expect(mockFs.open).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });

    it.each([
      {
        name: 'case-insensitive regex',
        grep: 'error|warn',
        initial: ['[INFO] start', '[ERROR] initial failure'],
        appended: '[INFO] next\n[WaRn] warning\n\n[error] appended failure\n',
        expectedInitial: ['[ERROR] initial failure'],
        expectedAppended: '[WaRn] warning\n[error] appended failure\n',
      },
      {
        name: 'no matches',
        grep: 'missing',
        initial: ['[INFO] start'],
        appended: '[INFO] next\n',
        expectedInitial: [],
        expectedAppended: '',
      },
      {
        name: 'empty initial log',
        grep: 'error',
        initial: [],
        appended: '[INFO] next\n[ERROR] appended failure\n',
        expectedInitial: [],
        expectedAppended: '[ERROR] appended failure\n',
      },
    ])(
      'filters followed lines with $name',
      async ({ grep, initial, appended, expectedInitial, expectedAppended }) => {
        const { watcher, following, initialSize } = await startFollowing(grep, initial);
        expect(
          vi
            .mocked(logger.info)
            .mock.calls.slice(1)
            .map(([message]) => message),
        ).toEqual(expectedInitial.length ? [expectedInitial.join('\n')] : []);
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const close = vi.fn().mockResolvedValue(undefined);
        const content = Buffer.from(appended);
        mockFs.stat.mockResolvedValue({ size: initialSize + content.length } as fsSync.Stats);
        mockFs.open.mockResolvedValue({
          read: vi.fn(async (buffer: Buffer) => {
            content.copy(buffer);
            return { bytesRead: content.length, buffer };
          }),
          close,
        } as unknown as Awaited<ReturnType<typeof fs.open>>);
        watcher.emit('change');
        await vi.advanceTimersByTimeAsync(100);
        expect(output.mock.calls).toEqual(expectedAppended ? [[expectedAppended]] : []);
        expect(close).toHaveBeenCalledOnce();

        watcher.emit('change');
        await vi.advanceTimersByTimeAsync(100);
        expect(mockFs.open).toHaveBeenCalledOnce();
        stop?.();
        await vi.advanceTimersByTimeAsync(100);
        await following;
      },
    );

    it.each([
      { name: 'split pattern', initial: [], parts: ['[ERR', 'OR] failed\n'] },
      { name: 'matching prefix', initial: [], parts: ['[ERROR]', ' failed\n'] },
      { name: 'initial unfinished line', initial: ['[ERR'], parts: ['OR]', ' failed\n'] },
    ])('buffers $name until its newline when filtering', async ({ initial, parts }) => {
      const { following, append } = await startFollowing('ERROR', initial, false);
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      expect(logger.info).toHaveBeenCalledTimes(1);
      await append(parts[0]);
      expect(output).not.toHaveBeenCalled();
      await append(parts[1]);
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] failed\n');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
      expect(output).toHaveBeenCalledOnce();
    });

    it('keeps split UTF-8 bytes intact when buffering a matching line', async () => {
      const { following, append } = await startFollowing('café');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const content = Buffer.from('[ERROR] café\n');
      await append(content.subarray(0, content.length - 2));
      expect(output).not.toHaveBeenCalled();
      await append(content.subarray(content.length - 2));
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] café\n');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });

    it.each([
      { name: 'initial fragment', initial: true, before: '[ERROR]', after: '[INFO] ' },
      { name: 'appended fragment', initial: false, before: '[ERROR]', after: '[INFO] ' },
      { name: 'newly matching fragment', initial: true, before: '[INFO] ', after: '[ERROR]' },
      { name: 'unchanged fragment', initial: true, before: '[ERROR]', after: '[ERROR]' },
      {
        name: 'rewrite coalesced with append',
        initial: true,
        before: '[ERROR]',
        after: '[INFO] ',
        coalesced: true,
      },
    ])(
      'rereads the pending $name before filtering',
      async ({ initial, before, after, coalesced }) => {
        const prefix = '[ERROR] already printed\n';
        const { following, append, replace } = await startFollowing(
          'ERROR',
          [],
          false,
          Buffer.from(prefix + (initial ? before : '')),
        );
        expect(logger.info).toHaveBeenLastCalledWith('[ERROR] already printed');
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        if (!initial) {
          await append(before);
        }
        await replace(prefix + after + (coalesced ? 'new\n' : ''));
        expect(output).not.toHaveBeenCalled();
        if (!coalesced) {
          await append('new\n');
        }
        stop?.();
        await vi.advanceTimersByTimeAsync(100);
        await following;
        expect(output.mock.calls).toEqual(after === '[ERROR]' ? [['[ERROR]new\n']] : []);
      },
    );

    it('preserves a UTF-8 character split across the initial snapshot', async () => {
      const content = Buffer.from('[ERROR] café\n');
      const { following, append } = await startFollowing(
        'café',
        [],
        false,
        content.subarray(0, content.length - 2),
      );
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await append(content.subarray(content.length - 2));
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] café\n');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });

    it('reads bytes appended during the initial snapshot from the captured offset', async () => {
      const { following, append } = await startFollowing(
        'ERROR',
        ['[ERR'],
        false,
        undefined,
        'OR] initial\n',
      );
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] initial\n');
      await append('[ERROR] later\n');
      expect(output.mock.calls).toEqual([['[ERROR] initial\n'], ['[ERROR] later\n']]);
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });

    it.each([true, false])(
      'keeps the initial 20-line limit (terminated: %s)',
      async (terminated) => {
        const lines = Array.from({ length: 25 }, (_, index) => `[ERROR] line ${index}`);
        const { following } = await startFollowing('ERROR', lines, terminated);
        expect(logger.info).toHaveBeenLastCalledWith(
          lines.slice(-20, terminated ? undefined : -1).join('\n'),
        );
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        stop?.();
        await vi.advanceTimersByTimeAsync(100);
        await following;
        expect(output.mock.calls).toEqual(terminated ? [] : [['[ERROR] line 24\n']]);
      },
    );

    it('handles short reads in both the initial snapshot and appended bytes', async () => {
      const { following, append } = await startFollowing(
        'ERROR',
        ['[ERROR] initial', '[ERR'],
        false,
        undefined,
        undefined,
        3,
      );
      expect(logger.info).toHaveBeenLastCalledWith('[ERROR] initial');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await append('OR] appended\n');
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] appended\n');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });

    it.each([false, true])('preserves initial CRLF handling (large file: %s)', async (large) => {
      const lines = Array.from({ length: 25 }, (_, index) => `[ERROR] line ${index}`);
      const content = Buffer.from(
        (large ? `${'x'.repeat(1024 * 1024)}\r\n` : '') + lines.join('\r\n') + '\r\n',
      );
      const { following } = await startFollowing('ERROR', [], true, content);
      expect(logger.info).toHaveBeenLastCalledWith(
        lines
          .slice(-20)
          .map((line) => line + (large ? '' : '\r'))
          .join('\n'),
      );
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });

    it('keeps immediate unfinished output without grep', async () => {
      const { following, append } = await startFollowing(undefined, ['initial'], false);
      expect(logger.info).toHaveBeenLastCalledWith('initial');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await append('[ERR');
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERR\n');
      await append('OR] failed\n');
      expect(output.mock.calls).toEqual([['[ERR\n'], ['OR] failed\n']]);
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });

    it.each(['SIGINT', 'SIGTERM'] as const)(
      'flushes a matching unfinished line only once on %s',
      async (signal) => {
        const { following, append } = await startFollowing('ERROR');
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        await append('[ERROR] unfinished');
        expect(output).not.toHaveBeenCalled();
        process.emit(signal);
        stop?.();
        await vi.advanceTimersByTimeAsync(100);
        await following;
        expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] unfinished\n');
      },
    );

    it('does not flush an unmatched unfinished line', async () => {
      const { following, append } = await startFollowing('ERROR');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await append('[INFO] unfinished');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
      expect(output).not.toHaveBeenCalled();
    });

    it('discards buffered text when the file is truncated', async () => {
      const { following, append, replace } = await startFollowing('ERROR', ['[INFO] previous']);
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await append('[ERR');
      await replace('');
      await append('OR] stale\n[ERROR] fresh\n');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] fresh\n');
    });

    it('discards buffered text immediately on rename, including before cleanup', async () => {
      const { watcher, following, append } = await startFollowing('ERROR');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await append('[ERROR] old file');
      watcher.emit('change', 'rename');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
      expect(output).not.toHaveBeenCalled();
    });

    it('prints complete initial lines and flushes only the unfinished tail on exit', async () => {
      const { following } = await startFollowing(
        'ERROR',
        ['[ERROR] ready', '[ERROR] unfinished'],
        false,
      );
      expect(logger.info).toHaveBeenLastCalledWith('[ERROR] ready');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
      expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] unfinished\n');
    });

    it('coalesces changes during a filtered read without duplicating its pending bytes', async () => {
      const { watcher, following } = await startFollowing('ERROR');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      let content = Buffer.from('[ERR');
      let finishRead: (() => void) | undefined;
      const read = vi.fn((buffer: Buffer, offset: number, length: number, position: number) => {
        const bytesRead = content.copy(buffer, offset, position, position + length);
        if (read.mock.calls.length === 1) {
          return new Promise((resolve) => {
            finishRead = () => resolve({ bytesRead, buffer });
          });
        }
        return Promise.resolve({ bytesRead, buffer });
      });
      mockFs.open.mockResolvedValue({
        read,
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as Awaited<ReturnType<typeof fs.open>>);
      mockFs.stat.mockResolvedValue({ size: content.length } as fsSync.Stats);
      try {
        watcher.emit('change');
        await vi.advanceTimersByTimeAsync(100);
        content = Buffer.from('[ERROR] failed\n');
        mockFs.stat.mockResolvedValue({ size: content.length } as fsSync.Stats);
        watcher.emit('change');
        await vi.advanceTimersByTimeAsync(100);
        expect(read).toHaveBeenCalledOnce();
        finishRead?.();
        await vi.advanceTimersByTimeAsync(100);
        expect(read).toHaveBeenCalledTimes(2);
        expect(read.mock.calls[1][3]).toBe(0);
        expect(output).toHaveBeenCalledExactlyOnceWith('[ERROR] failed\n');
      } finally {
        finishRead?.();
        stop?.();
        await vi.advanceTimersByTimeAsync(100);
        await following;
      }
    });

    it('does not restore buffered content from an in-flight read after cleanup', async () => {
      const { watcher, following, append } = await startFollowing('ERROR');
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await append('[ERR');
      let finishRead: (() => void) | undefined;
      const content = Buffer.from('[ERROR] stale\n');
      const close = vi.fn().mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ size: content.length } as fsSync.Stats);
      const read = vi.fn((buffer: Buffer, offset: number, length: number, position: number) => {
        const bytesRead = content.copy(buffer, offset, position, position + length);
        return new Promise((resolve) => {
          finishRead = () => resolve({ bytesRead, buffer });
        });
      });
      mockFs.open.mockResolvedValue({ read, close } as unknown as Awaited<
        ReturnType<typeof fs.open>
      >);
      watcher.emit('change');
      await vi.advanceTimersByTimeAsync(100);
      expect(read).toHaveBeenCalledOnce();
      stop?.();
      finishRead?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
      expect(output).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    });

    it('cancels pending file reads when interrupted', async () => {
      const { watcher, following } = await startFollowing();
      const reads = mockFs.stat.mock.calls.length;
      watcher.emit('change');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
      expect(watcher.close).toHaveBeenCalledOnce();
      expect(mockFs.stat).toHaveBeenCalledTimes(reads);
      expect(mockFs.open).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('handles asynchronous read errors during a follow', async () => {
      const { watcher, following } = await startFollowing();
      mockFs.stat.mockRejectedValueOnce(new Error('File removed'));
      watcher.emit('change');
      await vi.advanceTimersByTimeAsync(100);
      expect(logger.debug).toHaveBeenCalledWith('Error reading log file: File removed');
      stop?.();
      await vi.advanceTimersByTimeAsync(100);
      await following;
    });
  });

  describe('command registration', () => {
    it('should register logs command with correct options', () => {
      const cmd = program.commands.find((c) => c.name() === 'logs');

      expect(cmd).toBeDefined();
      expect(cmd?.description()).toContain('View promptfoo log files');

      const options = cmd?.options;
      expect(options?.find((o) => o.long === '--type')).toBeDefined();
      expect(options?.find((o) => o.long === '--lines')).toBeDefined();
      expect(options?.find((o) => o.long === '--head')).toBeDefined();
      expect(options?.find((o) => o.long === '--follow')).toBeDefined();
      expect(options?.find((o) => o.long === '--list')).toBeDefined();
      expect(options?.find((o) => o.long === '--grep')).toBeDefined();
      expect(options?.find((o) => o.long === '--no-color')).toBeDefined();
    });

    it('should register list subcommand', () => {
      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      const listCmd = logsCmd?.commands.find((c) => c.name() === 'list');

      expect(listCmd).toBeDefined();
      expect(listCmd?.description()).toContain('List available log files');
    });
  });

  describe('--list option', () => {
    it('should display message when no log files found', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('all');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No log files found'));
    });

    it('should display table when log files exist', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([
        {
          name: 'promptfoo-debug-2024-01-01_10-00-00.log',
          path: '/home/user/.promptfoo/logs/promptfoo-debug-2024-01-01_10-00-00.log',
          mtime: new Date('2024-01-01T10:00:00Z'),
          type: 'debug',
          size: 1024,
        },
      ]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list']);

      // wrapTable is called and result is logged
      expect(logger.info).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo logs <filename>'),
      );
    });

    it('should filter by type when specified', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list', '--type', 'error']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('error');
    });

    it('should default to all log types', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('all');
    });
  });

  describe('viewing log files', () => {
    const mockLogPath = '/home/user/.promptfoo/logs/promptfoo-debug-2024-01-01_10-00-00.log';
    const mockLogContent = `2024-01-01T10:00:00.000Z [INFO]: Test message 1
2024-01-01T10:00:01.000Z [DEBUG]: Test debug message
2024-01-01T10:00:02.000Z [ERROR]: Test error message
2024-01-01T10:00:03.000Z [WARN]: Test warning message`;

    beforeEach(() => {
      mockLogsUtil.findLogFile.mockReturnValue(null);
      mockLogsUtil.getLogFiles.mockResolvedValue([
        {
          name: 'promptfoo-debug-2024-01-01_10-00-00.log',
          path: mockLogPath,
          mtime: new Date('2024-01-01T10:00:00Z'),
          type: 'debug',
          size: mockLogContent.length,
        },
      ]);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: mockLogContent.length,
        mtime: new Date('2024-01-01T10:00:00Z'),
      } as any);
      mockFs.readFile.mockResolvedValue(mockLogContent);
    });

    it('should show error when no log files available', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No log files found'));
      expect(process.exitCode).toBe(1);
    });

    it('should show error when specified file not found', async () => {
      mockLogsUtil.findLogFile.mockReturnValue(null);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', 'nonexistent.log']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Log file not found'));
      expect(process.exitCode).toBe(1);
    });

    it('should display most recent log file by default', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('promptfoo-debug'));
      expect(mockFs.readFile).toHaveBeenCalledWith(mockLogPath, 'utf-8');
    });

    it('should use current session log file when available', async () => {
      const sessionLogPath = '/session/log/path.log';
      mockCliState.debugLogFile = sessionLogPath;
      mockFs.access.mockImplementation(async (p) => {
        if (p !== sessionLogPath) {
          throw new Error('Not found');
        }
      });
      mockFs.stat.mockResolvedValue({
        size: mockLogContent.length,
        mtime: new Date(),
      } as any);
      mockFs.readFile.mockResolvedValue(mockLogContent);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(mockFs.readFile).toHaveBeenCalledWith(sessionLogPath, 'utf-8');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('current CLI session'));
    });

    it('should display specific file when provided', async () => {
      mockLogsUtil.findLogFile.mockReturnValue(mockLogPath);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', 'promptfoo-debug-2024-01-01_10-00-00.log']);

      expect(mockLogsUtil.findLogFile).toHaveBeenCalledWith(
        'promptfoo-debug-2024-01-01_10-00-00.log',
        'all',
      );
      expect(mockFs.readFile).toHaveBeenCalledWith(mockLogPath, 'utf-8');
    });

    it('should limit output with --lines option', async () => {
      mockLogsUtil.findLogFile.mockReturnValue(mockLogPath);
      mockLogsUtil.readLastLines.mockResolvedValue(['line 1', 'line 2']);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '-n', '2']);

      expect(mockLogsUtil.readLastLines).toHaveBeenCalledWith(mockLogPath, 2);
    });

    it('should handle permission errors', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([
        {
          name: 'test.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: 100,
        },
      ]);
      mockFs.access.mockRejectedValue(new Error('Permission denied'));

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
      expect(process.exitCode).toBe(1);
    });

    it('should handle empty log files', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([
        {
          name: 'empty.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: 0,
        },
      ]);
      mockFs.stat.mockResolvedValue({
        size: 0,
        mtime: new Date(),
      } as any);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Log file is empty'));
    });

    it('should warn about large files', async () => {
      const largeSize = 2 * 1024 * 1024; // 2MB
      mockLogsUtil.getLogFiles.mockResolvedValue([
        {
          name: 'large.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: largeSize,
        },
      ]);
      mockFs.stat.mockResolvedValue({
        size: largeSize,
        mtime: new Date(),
      } as any);
      mockFs.readFile.mockResolvedValue('a'.repeat(largeSize));

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('large'));
    });

    it('should filter output with --grep option', async () => {
      const logContentWithErrors = `2024-01-01T10:00:00.000Z [INFO]: Starting application
2024-01-01T10:00:01.000Z [ERROR]: Connection failed
2024-01-01T10:00:02.000Z [INFO]: Retrying connection
2024-01-01T10:00:03.000Z [ERROR]: Connection timeout`;

      mockLogsUtil.getLogFiles.mockResolvedValue([
        {
          name: 'test.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: logContentWithErrors.length,
        },
      ]);
      mockFs.stat.mockResolvedValue({
        size: logContentWithErrors.length,
        mtime: new Date(),
      } as any);
      mockFs.readFile.mockResolvedValue(logContentWithErrors);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--grep', 'ERROR']);

      // Should have logged content containing ERROR lines
      expect(logger.info).toHaveBeenCalled();
      const calls = vi.mocked(logger.info).mock.calls;
      const outputCall = calls.find((call) => String(call[0]).includes('Connection'));
      expect(outputCall).toBeDefined();
    });

    it('should show message when grep finds no matches', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([
        {
          name: 'test.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: mockLogContent.length,
        },
      ]);
      mockFs.stat.mockResolvedValue({
        size: mockLogContent.length,
        mtime: new Date(),
      } as any);
      mockFs.readFile.mockResolvedValue(mockLogContent);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--grep', 'NONEXISTENT_PATTERN']);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No lines matching pattern found'),
      );
    });

    it('should handle invalid regex patterns gracefully', async () => {
      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--grep', '[invalid']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid grep pattern'));
      expect(process.exitCode).toBe(1);
    });
  });

  describe('list subcommand', () => {
    it('should list all log types by default', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      const listCmd = logsCmd?.commands.find((c) => c.name() === 'list');
      await listCmd?.parseAsync(['node', 'test']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('all');
    });

    it('should filter by type when specified', async () => {
      mockLogsUtil.getLogFiles.mockResolvedValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      const listCmd = logsCmd?.commands.find((c) => c.name() === 'list');
      await listCmd?.parseAsync(['node', 'test', '--type', 'error']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('error');
    });
  });

  describe('error handling', () => {
    it('should handle general errors gracefully', async () => {
      mockLogsUtil.getLogFiles.mockRejectedValue(new Error('Unexpected error'));

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read logs'));
      expect(process.exitCode).toBe(1);
    });

    it('should reject invalid --type values', async () => {
      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--type', 'invalid']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid log type'));
      expect(process.exitCode).toBe(1);
    });

    it('should reject invalid --lines values', async () => {
      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--lines', '-5']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('--lines must be a positive number'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should reject invalid --head values', async () => {
      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--head', 'abc']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('--head must be a positive number'),
      );
      expect(process.exitCode).toBe(1);
    });
  });
});
