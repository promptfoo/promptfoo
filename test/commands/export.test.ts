import { EventEmitter } from 'events';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { Writable } from 'stream';
import zlib from 'zlib';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { exportCommand } from '../../src/commands/export';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { getLogDirectory, getLogFiles } from '../../src/util/logs';
import { writeOutput } from '../../src/util/output';

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
    const mockGetLogDirectory = vi.mocked(getLogDirectory);
    const mockGetLogFiles = vi.mocked(getLogFiles);

    beforeEach(() => {
      vi.mocked(fs.createWriteStream).mockReset();
      vi.mocked(zlib.createGzip).mockReset();
      mockFsPromises.readFile.mockReset();
      mockFsPromises.stat.mockReset();
      mockGetLogDirectory.mockReturnValue(mockLogDir);
      mockGetLogFiles.mockResolvedValue([]);
      mockFsPromises.access.mockResolvedValue(undefined);
      // Reset all mocks for clean state
      vi.clearAllMocks();
      exportCommand(program);
    });

    it('should handle missing log directory', async () => {
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));

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
      mockGetLogFiles.mockResolvedValue([
        {
          name: 'promptfoo-debug-2025-01-01.log',
          path: '/test/config/logs/promptfoo-debug-2025-01-01.log',
          mtime: new Date(),
          type: 'debug',
          size: 1024,
        },
      ]);

      await program.parseAsync(['node', 'test', 'export', 'logs', '--count', count]);

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

      await program.parseAsync(['node', 'test', 'export', 'logs', '--output', 'logs.gz']);

      expect(mockFsPromises.readFile).toHaveBeenCalledWith(logPath);
      expect(mockFsPromises.stat).toHaveBeenCalledWith(logPath);
      expect(logger.info).toHaveBeenCalledWith('Log files have been collected in: logs.gz');
    });

    it.each([
      [0, 0],
      [511, 511],
      [512, 512],
      [513, 513],
      [511, 512],
      [512, 513],
      [513, 512],
      [512, 511],
      [1, 0],
      [0, 1],
    ])(
      'archives the bytes read when stat reports %i bytes and readFile returns %i',
      async (statSize, readSize) => {
        const files = [
          { name: 'promptfoo-debug-first.log', content: Buffer.alloc(readSize, 65) },
          { name: 'promptfoo-debug-second.log', content: Buffer.from('second log entry\n') },
        ];
        const mtime = new Date('2025-01-01T00:00:00.000Z');
        const compressed: Buffer[] = [];
        const output = new Writable({
          write(chunk, _encoding, callback) {
            compressed.push(Buffer.from(chunk));
            callback();
          },
        });
        const actualZlib = await vi.importActual<typeof import('zlib')>('zlib');

        vi.mocked(fs.createWriteStream).mockReturnValue(output as unknown as fs.WriteStream);
        vi.mocked(zlib.createGzip).mockImplementation(actualZlib.createGzip);
        mockGetLogFiles.mockResolvedValue(
          files.map((file, index) => ({
            name: file.name,
            path: `${mockLogDir}/${file.name}`,
            mtime,
            type: 'debug',
            size: index === 0 ? statSize : file.content.length,
          })),
        );
        mockFsPromises.readFile.mockImplementation(async (filePath) => {
          const file = files.find((file) => filePath === `${mockLogDir}/${file.name}`);
          if (!file) {
            throw new Error(`Unexpected log path: ${filePath}`);
          }
          return file.content;
        });
        mockFsPromises.stat.mockImplementation(async (filePath) => {
          const size =
            filePath === `${mockLogDir}/${files[0].name}` ? statSize : files[1].content.length;
          return { size, mtime } as fs.Stats;
        });

        await program.parseAsync(['node', 'test', 'export', 'logs', '--output', 'logs.gz']);

        expect(process.exitCode).toBe(0);
        const archive = actualZlib.gunzipSync(Buffer.concat(compressed));
        let offset = 0;
        for (const file of files) {
          const header = archive.subarray(offset, offset + 512);
          const size = parseInt(header.toString('ascii', 124, 136).trim(), 8);
          expect(header.toString('utf8', 0, 100).replace(/\0.*$/s, '')).toBe(file.name);
          expect(size).toBe(file.content.length);
          expect(parseInt(header.toString('ascii', 136, 148).trim(), 8)).toBe(
            mtime.getTime() / 1000,
          );
          expect(archive.subarray(offset + 512, offset + 512 + size)).toEqual(file.content);
          offset += 512 + Math.ceil(size / 512) * 512;
        }
        expect(archive.subarray(offset)).toEqual(Buffer.alloc(1024));
      },
    );
  });
});
