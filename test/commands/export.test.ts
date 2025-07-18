import { Command } from 'commander';
import { exportCommand } from '../../src/commands/export';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { writeOutput } from '../../src/util';

jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));

jest.mock('../../src/util', () => ({
  writeOutput: jest.fn(),
  createOutputMetadata: jest.fn().mockReturnValue({
    promptfooVersion: '1.0.0',
    nodeVersion: 'v18.0.0',
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

describe('exportCommand', () => {
  let program: Command;
  let mockExit: jest.SpyInstance;
  let mockEval: any;

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

    await program.parseAsync(['node', 'test', 'export', 'latest', '--output', 'test.json']);

    expect(Eval.latest).toHaveBeenCalledWith();
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should export eval record by id', async () => {
    jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'test-id', '--output', 'test.json']);

    expect(Eval.findById).toHaveBeenCalledWith('test-id');
    expect(writeOutput).toHaveBeenCalledWith('test.json', mockEval, null);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should log JSON data when no output specified', async () => {
    jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval);

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'test-id']);

    const expectedJson = {
      evalId: 'test-id',
      results: { test: 'summary' },
      config: { test: 'config' },
      shareableUrl: null,
      metadata: {
        promptfooVersion: '1.0.0',
        nodeVersion: 'v18.0.0',
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

    await program.parseAsync(['node', 'test', 'export', 'non-existent-id']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle export errors', async () => {
    jest.spyOn(Eval, 'findById').mockRejectedValue(new Error('Export failed'));

    exportCommand(program);

    await program.parseAsync(['node', 'test', 'export', 'test-id']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
