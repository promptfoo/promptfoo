import { EventEmitter } from 'events';
import fs from 'fs';
import fsPromises from 'fs/promises';
import zlib from 'zlib';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { exportCommand } from '../../src/commands/export';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { writeOutput } from '../../src/util/index';
import { getLogDirectory, getLogFiles } from '../../src/util/logs';

vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    writeOutput: vi.fn(),

    createOutputMetadata: vi.fn().mockReturnValue({
      promptfooVersion: '1.0.0',
      nodeVersion: 'v20.0.0',
      platform: 'linux',
      arch: 'x64',
      exportedAt: '2025-07-01T00:00:00.000Z',
      evaluationCreatedAt: '2025-07-01T00:00:00.000Z',
      author: 'test-author',
    }),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
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

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      createWriteStream: vi.fn(),
    },
    createWriteStream: vi.fn(),
  };
});

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    stat: vi.fn(),
  },
  access: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('zlib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zlib')>();
  return {
    ...actual,
    default: {
      ...actual,
      createGzip: vi.fn(),
    },
    createGzip: vi.fn(),
    gzip: vi.fn(),
  };
});

vi.mock('../../src/database', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getDbInstance: vi.fn(),
  };
});

describe('exportCommand', () => {
  let program: Command;
  let mockEval: any;
  const mockFsPromises = fsPromises as Mocked<typeof fsPromises>;

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
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null);
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
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null);
    expect(process.exitCode).toBe(0);
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
    const mockGetLogDirectory = vi.mocked(getLogDirectory);
    const mockGetLogFiles = vi.mocked(getLogFiles);

    beforeEach(() => {
      mockGetLogDirectory.mockReturnValue(mockLogDir);
      mockGetLogFiles.mockResolvedValue([]);
      mockFsPromises.access.mockResolvedValue(undefined);
      // Reset all mocks for clean state
      vi.clearAllMocks();
    });

    it('should handle missing log directory', async () => {
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs']);

      expect(logger.error).toHaveBeenCalledWith(
        `No log directory found. Logs are created when running commands like "promptfoo eval".\nLog directory: ${mockLogDir}`,
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle no log files found', async () => {
      mockGetLogFiles.mockResolvedValue([]);

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs']);

      expect(logger.error).toHaveBeenCalledWith(
        `No log files found in the logs directory. Logs are created when running commands like "promptfoo eval".\nLog directory: ${mockLogDir}`,
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle invalid count parameter', async () => {
      mockGetLogFiles.mockResolvedValue([
        {
          name: 'promptfoo-debug-2025-01-01.log',
          path: '/test/config/logs/promptfoo-debug-2025-01-01.log',
          mtime: new Date(),
          type: 'debug',
          size: 1024,
        },
      ]);

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs', '--count', 'invalid']);

      expect(logger.error).toHaveBeenCalledWith('Count must be a positive number');
      expect(process.exitCode).toBe(1);
    });

    it('should handle zero count parameter', async () => {
      mockGetLogFiles.mockResolvedValue([
        {
          name: 'promptfoo-debug-2025-01-01.log',
          path: '/test/config/logs/promptfoo-debug-2025-01-01.log',
          mtime: new Date(),
          type: 'debug',
          size: 1024,
        },
      ]);

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs', '--count', '0']);

      expect(logger.error).toHaveBeenCalledWith('Count must be a positive number');
      expect(process.exitCode).toBe(1);
    });

    it('should archive log files using async fs helpers', async () => {
      const logPath = '/test/config/logs/promptfoo-debug-2025-01-01.log';
      const output = new EventEmitter() as EventEmitter & {
        on: typeof EventEmitter.prototype.on;
      };
      const gzip = {
        end: vi.fn(() => output.emit('close')),
        pipe: vi.fn(),
        write: vi.fn(),
        on: vi.fn(),
      };

      vi.mocked(fs.createWriteStream).mockReturnValue(output as unknown as fs.WriteStream);
      vi.mocked(zlib.createGzip).mockReturnValue(gzip as unknown as zlib.Gzip);
      mockGetLogFiles.mockResolvedValue([
        {
          name: 'promptfoo-debug-2025-01-01.log',
          path: logPath,
          mtime: new Date('2025-01-01T00:00:00.000Z'),
          type: 'debug',
          size: 12,
        },
      ]);
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('hello logs'));
      mockFsPromises.stat.mockImplementation(async (filePath) => {
        if (filePath === 'logs.gz') {
          return { size: 123 } as fs.Stats;
        }
        return {
          size: 10,
          mtime: new Date('2025-01-01T00:00:00.000Z'),
        } as fs.Stats;
      });

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs', '--output', 'logs.gz']);

      expect(mockFsPromises.readFile).toHaveBeenCalledWith(logPath);
      expect(mockFsPromises.stat).toHaveBeenCalledWith(logPath);
      expect(logger.info).toHaveBeenCalledWith('Log files have been collected in: logs.gz');
    });
  });
});
