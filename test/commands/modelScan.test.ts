import { type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Command } from 'commander';

jest.mock('child_process');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));
jest.mock('../../src/database', () => ({
  getDb: jest.fn().mockReturnValue({
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        run: jest.fn().mockResolvedValue({ lastInsertRowid: 1 }),
      }),
    }),
  }),
}));
jest.mock('../../src/globalConfig/accounts', () => ({
  getAuthor: jest.fn().mockReturnValue('test-author'),
}));

// Import after mocks are set up
import { spawn } from 'child_process';
import logger from '../../src/logger';
import { modelScanCommand } from '../../src/commands/modelScan';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock the promisify util at the module level to handle checkModelAuditInstalled
jest.mock('util', () => {
  const actualUtil = jest.requireActual('util');
  return {
    ...actualUtil,
    promisify: jest.fn().mockImplementation((fn) => {
      // Return a mock function that resolves by default
      return jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
    }),
  };
});

describe('modelScanCommand', () => {
  let program: Command;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.clearAllMocks();

    // Default mock spawn to return a valid child process
    const defaultMockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          setImmediate(() => callback(0));
        }
        return defaultMockChildProcess;
      }),
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    } as unknown as ChildProcess;

    mockSpawn.mockReturnValue(defaultMockChildProcess);
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should exit if no paths are provided', async () => {
    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model']);

    expect(logger.error).toHaveBeenCalledWith(
      'No paths specified. Please provide at least one model file or directory to scan.',
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should spawn modelaudit process with correct arguments', async () => {
    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess;
      }),
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    } as unknown as ChildProcess;

    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    const parsePromise = command.parseAsync([
      'node',
      'scan-model',
      'path1',
      'path2',
      '--blacklist',
      'pattern1',
      '--format',
      'json',
      '--output',
      'output.json',
      '--timeout',
      '600',
      '--verbose',
      '--max-file-size',
      '1000000',
      '--max-total-size',
      '5000000',
    ]);

    // Emit JSON output before close event
    setImmediate(() => {
      (mockChildProcess.stdout as EventEmitter).emit(
        'data',
        Buffer.from('{"success": true, "issues": []}'),
      );
    });

    await parsePromise;

    expect(mockSpawn).toHaveBeenCalledWith('modelaudit', [
      'scan',
      'path1',
      'path2',
      '--blacklist',
      'pattern1',
      '--format',
      'json',
      '--output',
      'output.json',
      '--timeout',
      '600',
      '--verbose',
      '--max-file-size',
      '1000000',
      '--max-total-size',
      '5000000',
    ]);
  });

  it('should handle modelaudit process error', async () => {
    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          callback(new Error('spawn error'));
        }
        return mockChildProcess;
      }),
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    } as unknown as ChildProcess;

    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('Failed to start modelaudit: spawn error');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle --no-write option', async () => {
    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return mockChildProcess;
      }),
      stdout: null,
      stderr: null,
    } as unknown as ChildProcess;

    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model', '--no-write']);

    // With --no-write, it should spawn with stdio: 'inherit'
    expect(mockSpawn).toHaveBeenCalledWith('modelaudit', expect.any(Array), { stdio: 'inherit' });
  });
});
