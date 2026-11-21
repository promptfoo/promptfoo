import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { PassThrough } from 'stream';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCommand } from '../../src/commands/export';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { getLogDirectory, getLogFiles } from '../../src/util/logs';
import { writeOutput } from '../../src/util/output';
import { createDeferred } from '../util/utils';

vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

vi.mock('../../src/util/output', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    writeOutput: vi.fn(),
    createOutputData: vi.fn().mockImplementation(async (evalRecord, shareableUrl) => ({
      evalId: evalRecord.id,
      results: await evalRecord.toEvaluateSummary(),
      config: evalRecord.config,
      shareableUrl,
      metadata: {
        promptfooVersion: '1.0.0',
        nodeVersion: 'v20.0.0',
        platform: 'linux',
        arch: 'x64',
        exportedAt: '2025-07-01T00:00:00.000Z',
        evaluationCreatedAt: '2025-07-01T00:00:00.000Z',
        author: 'test-author',
      },
    })),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn().mockReturnValue('/tmp/test-config'),
  maybeReadConfig: vi.fn(),
  readConfigs: vi.fn(),
  writeMultipleOutputs: vi.fn(),
}));

vi.mock('../../src/util/logs', () => ({
  getLogDirectory: vi.fn().mockReturnValue('/tmp/test-config/logs'),
  getLogFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/database', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getDbInstance: vi.fn(),
  };
});

describe('exportCommand', () => {
  let program: Command;
  let mockEval: any;

  beforeEach(() => {
    program = new Command();
    process.exitCode = 0;
    mockEval = {
      id: 'test-id',
      createdAt: '2025-07-01T00:00:00.000Z',
      author: 'test-author',
      config: { test: 'config' },
      toEvaluateSummary: vi.fn().mockResolvedValue({ test: 'summary' }),
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-07-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    process.exitCode = 0;
  });

  it('should export latest eval record', async () => {
    vi.spyOn(Eval, 'latest').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'latest', '--output', 'test.json']);

    expect(Eval.latest).toHaveBeenCalledWith();
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null, {
      includeMedia: false,
    });
    expect(process.exitCode).toBe(0);
  });

  it('should export eval record by id', async () => {
    vi.spyOn(Eval, 'findById').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync([
      'node',
      'test',
      'export',
      'eval',
      'test-id',
      '--output',
      'test.json',
    ]);

    expect(Eval.findById).toHaveBeenCalledWith('test-id');
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null, {
      includeMedia: false,
    });
    expect(process.exitCode).toBe(0);
  });

  it('should pass embedded media opt-in to file exports', async () => {
    vi.spyOn(Eval, 'findById').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync([
      'node',
      'test',
      'export',
      'eval',
      'test-id',
      '--include-media',
      '--output',
      'test.json',
    ]);

    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null, {
      includeMedia: true,
    });
  });

  it('should log JSON data when no output specified', async () => {
    vi.spyOn(Eval, 'findById').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'test-id']);

    const expectedJson = {
      evalId: 'test-id',
      results: { test: 'summary' },
      config: { test: 'config' },
      shareableUrl: null,
      metadata: {
        promptfooVersion: '1.0.0',
        nodeVersion: 'v20.0.0',
        platform: 'linux',
        arch: 'x64',
        exportedAt: '2025-07-01T00:00:00.000Z',
        evaluationCreatedAt: '2025-07-01T00:00:00.000Z',
        author: 'test-author',
      },
    };

    expect(logger.info).toHaveBeenCalledWith(JSON.stringify(expectedJson, null, 2));
  });

  it('should exit with error when eval not found', async () => {
    vi.spyOn(Eval, 'findById').mockResolvedValue(undefined);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'non-existent-id']);

    expect(process.exitCode).toBe(1);
  });

  it('should handle export errors', async () => {
    vi.spyOn(Eval, 'findById').mockRejectedValue(new Error('Export failed'));

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'test-id']);

    expect(process.exitCode).toBe(1);
  });

  describe('logs export', () => {
    const mockLogDir = '/test/config/logs';
    const logFile = {
      name: 'promptfoo-debug-2025-01-01.log',
      path: `${mockLogDir}/promptfoo-debug-2025-01-01.log`,
      mtime: new Date('2025-01-01T00:00:00.000Z'),
      type: 'debug' as const,
      size: 10,
    };
    const mockGetLogDirectory = vi.mocked(getLogDirectory);
    const mockGetLogFiles = vi.mocked(getLogFiles);

    beforeEach(() => {
      mockGetLogDirectory.mockReturnValue(mockLogDir);
      mockGetLogFiles.mockResolvedValue([]);
      vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
      exportCommand(program);
    });

    afterEach(() => {
      vi.mocked(fsPromises.access).mockRestore();
    });

    it('should handle missing log directory', async () => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));

      await program.parseAsync(['node', 'test', 'export', 'logs']);

      expect(logger.error).toHaveBeenCalledWith(
        `No log directory found. Logs are created when running commands like "promptfoo eval".\nLog directory: ${mockLogDir}`,
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle no log files found', async () => {
      mockGetLogFiles.mockResolvedValue([]);

      await program.parseAsync(['node', 'test', 'export', 'logs']);

      expect(logger.error).toHaveBeenCalledWith(
        `No log files found in the logs directory. Logs are created when running commands like "promptfoo eval".\nLog directory: ${mockLogDir}`,
      );
      expect(process.exitCode).toBe(1);
    });

    it.each([
      ['should handle invalid count parameter', 'invalid'],
      ['should handle zero count parameter', '0'],
    ])('%s', async (_title, count) => {
      mockGetLogFiles.mockResolvedValue([logFile]);

      await program.parseAsync(['node', 'test', 'export', 'logs', '--count', count]);

      expect(logger.error).toHaveBeenCalledWith('Count must be a positive number');
      expect(process.exitCode).toBe(1);
    });

    it('pauses reading log files while the archive destination is backpressured', async () => {
      const content = randomBytes(128 * 1024);
      const files = Array.from({ length: 12 }, (_, i) => ({
        ...logFile,
        path: `${logFile.path}.${i}`,
      }));
      mockGetLogFiles.mockResolvedValue(files);
      using readFile = vi.spyOn(fsPromises, 'readFile').mockResolvedValue(content);
      using _stat = vi.spyOn(fsPromises, 'stat').mockResolvedValue({
        size: content.length,
        mtime: logFile.mtime,
      } as fs.Stats);
      const output = new PassThrough({ highWaterMark: 1 });
      using _write = vi
        .spyOn(fs, 'createWriteStream')
        .mockReturnValue(output as unknown as fs.WriteStream);
      const command = program.parseAsync(['node', 'test', 'export', 'logs', '--output', 'logs.gz']);
      try {
        await Promise.race([once(output, 'readable'), command]);
        await setImmediate();
        expect(output.writableNeedDrain).toBe(true);
        expect(readFile.mock.calls.length).toBeLessThan(files.length);
      } finally {
        output.resume();
        await command;
      }
      expect(readFile.mock.calls.map(([file]) => file)).toEqual(files.map(({ path }) => path));
      expect(logger.info).toHaveBeenCalledWith('Log files have been collected in: logs.gz');
    });

    it.each([
      ['readFile', new Error('disk full'), 'Failed to collect logs: Error: disk full'],
      ['stat', undefined, 'ERR_STREAM_PREMATURE_CLOSE'],
    ] as const)(
      'stops collecting logs if the destination closes during %s',
      async (pending, error, message) => {
        const output = new PassThrough();
        using _write = vi
          .spyOn(fs, 'createWriteStream')
          .mockReturnValue(output as unknown as fs.WriteStream);
        using readFile = vi.spyOn(fsPromises, 'readFile').mockResolvedValue(Buffer.alloc(0));
        using stat = vi
          .spyOn(fsPromises, 'stat')
          .mockResolvedValue({ size: 0, mtime: logFile.mtime } as fs.Stats);
        mockGetLogFiles.mockResolvedValue([logFile, { ...logFile, path: `${logFile.path}.next` }]);
        const rotated = createDeferred<never>();
        const fileOps = { readFile, stat };
        fileOps[pending].mockImplementationOnce(() => {
          output.destroy(error);
          return rotated.promise;
        });
        const command = program.parseAsync([
          'node',
          'test',
          'export',
          'logs',
          '--output',
          'logs.gz',
        ]);
        try {
          await vi.waitFor(() =>
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(message)),
          );
          expect(process.exitCode).toBe(1);
        } finally {
          rotated.reject(Object.assign(new Error('rotated'), { code: 'ENOENT' }));
          await command;
        }
        await setImmediate();
        expect(readFile).toHaveBeenCalledExactlyOnceWith(logFile.path);
        expect(stat).toHaveBeenCalledExactlyOnceWith(logFile.path);
        expect(logger.info).not.toHaveBeenCalledWith(
          expect.stringMatching(/Created log archive:|Log files have been collected/),
        );
      },
    );
  });
});
