import fs from 'fs';

import { Command } from 'commander';
import { exportCommand } from '../../src/commands/export';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { writeOutput } from '../../src/util/index';
import { getConfigDirectoryPath } from '../../src/util/config/manage';

jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));

jest.mock('../../src/util', () => ({
  writeOutput: jest.fn(),
  createOutputMetadata: jest.fn().mockReturnValue({
    promptfooVersion: '1.0.0',
    nodeVersion: 'v20.0.0',
    platform: 'linux',
    arch: 'x64',
    exportedAt: '2025-07-01T00:00:00.000Z',
    evaluationCreatedAt: '2025-07-01T00:00:00.000Z',
    author: 'test-author',
  }),
}));

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  createWriteStream: jest.fn(),
}));

jest.mock('zlib', () => ({
  createGzip: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  getDbInstance: jest.fn(),
}));

describe('exportCommand', () => {
  let program: Command;
  let mockExit: jest.SpyInstance;
  let mockEval: any;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockGetConfigDirectoryPath = getConfigDirectoryPath as jest.MockedFunction<
    typeof getConfigDirectoryPath
  >;

  beforeEach(() => {
    program = new Command();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockEval = {
      id: 'test-id',
      createdAt: '2025-07-01T00:00:00.000Z',
      author: 'test-author',
      config: { test: 'config' },
      toEvaluateSummary: jest.fn().mockResolvedValue({ test: 'summary' }),
    };
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-07-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should export latest eval record', async () => {
    jest.spyOn(Eval, 'latest').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'latest', '--output', 'test.json']);

    expect(Eval.latest).toHaveBeenCalledWith();
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should export eval record by id', async () => {
    jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval);

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
    jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'test-id']);

    const expectedJson = {
      id: 'test-id',
      createdAt: '2025-07-01T00:00:00.000Z',
      author: 'test-author',
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
    jest.spyOn(Eval, 'findById').mockResolvedValue(undefined);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'non-existent-id']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle export errors', async () => {
    jest.spyOn(Eval, 'findById').mockRejectedValue(new Error('Export failed'));

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'eval', 'test-id']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  describe('logs export', () => {
    const mockConfigDir = '/test/config';

    beforeEach(() => {
      mockGetConfigDirectoryPath.mockReturnValue(mockConfigDir);
      // Reset all mocks for clean state
      jest.clearAllMocks();
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
