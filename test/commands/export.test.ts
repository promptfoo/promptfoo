import {
  Mocked,
  MockedFunction,
  MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import fs from 'fs';

import { Command } from 'commander';
import { exportCommand } from '../../src/commands/export';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { writeOutput } from '../../src/util/index';
import { getConfigDirectoryPath } from '../../src/util/config/manage';

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

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
    createWriteStream: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
  createWriteStream: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('zlib', async (importOriginal) => {
  return {
    ...(await importOriginal()),
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
  let mockExit: MockInstance;
  let mockEval: any;
  const mockFs = fs as Mocked<typeof fs>;
  const mockGetConfigDirectoryPath = getConfigDirectoryPath as MockedFunction<
    typeof getConfigDirectoryPath
  >;

  beforeEach(() => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
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
  });

  it('should export latest eval record', async () => {
    vi.spyOn(Eval, 'latest').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'latest', '--output', 'test.json']);

    expect(Eval.latest).toHaveBeenCalledWith();
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null);
    expect(mockExit).not.toHaveBeenCalled();
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
    expect(mockExit).not.toHaveBeenCalled();
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

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle export errors', async () => {
    vi.spyOn(Eval, 'findById').mockRejectedValue(new Error('Export failed'));

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'test-id']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  describe('logs export', () => {
    const mockConfigDir = '/test/config';
    const _mockLogDir = '/test/config/logs';

    beforeEach(() => {
      mockGetConfigDirectoryPath.mockReturnValue(mockConfigDir);
      // Reset all mocks for clean state
      vi.clearAllMocks();
    });

    it('should handle missing log directory', async () => {
      mockFs.existsSync.mockReturnValue(false);

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs']);

      expect(logger.error).toHaveBeenCalledWith(
        'No log directory found. Logs have not been created yet.',
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle no log files found', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs']);

      expect(logger.error).toHaveBeenCalledWith('No log files found in the logs directory.');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle invalid count parameter', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['promptfoo-2025-01-01.log'] as any);

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs', '--count', 'invalid']);

      expect(logger.error).toHaveBeenCalledWith('Count must be a positive number');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle zero count parameter', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['promptfoo-2025-01-01.log'] as any);

      exportCommand(program);

      await program.parseAsync(['node', 'test', 'export', 'logs', '--count', '0']);

      expect(logger.error).toHaveBeenCalledWith('Count must be a positive number');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
