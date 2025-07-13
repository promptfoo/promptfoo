import { spawn, type ChildProcess } from 'child_process';
import { Command } from 'commander';
import { modelScanCommand, checkModelAuditInstalled } from '../../src/commands/modelScan';
import logger from '../../src/logger';

jest.mock('child_process');
jest.mock('../../src/logger');

describe('modelScanCommand', () => {
  let program: Command;
  let mockSpawn: jest.MockedFunction<typeof spawn>;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    mockSpawn = jest.mocked(spawn);
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should exit if no paths are provided', async () => {
    // Mock checkModelAuditInstalled to return true
    const mockChildProcess = {
      on: jest.fn((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
      }),
    } as unknown as ChildProcess;
    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model']);

    expect(logger.error).toHaveBeenCalledWith(
      'No paths specified. Please provide at least one model file or directory to scan.',
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit if modelaudit is not installed', async () => {
    // Mock checkModelAuditInstalled to return false
    const mockChildProcess = {
      on: jest.fn((event, callback) => {
        if (event === 'error') {
          callback(new Error('command not found'));
        }
      }),
    } as unknown as ChildProcess;
    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('ModelAudit is not installed.');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should spawn modelaudit process with correct arguments', async () => {
    // Mock for checkModelAuditInstalled call
    let isFirstCall = true;
    mockSpawn.mockImplementation((command, args, options) => {
      if (isFirstCall) {
        // First call is checkModelAuditInstalled
        isFirstCall = false;
        const mockCheckProcess = {
          on: jest.fn((event, callback) => {
            if (event === 'exit') {
              callback(0);
            }
          }),
        } as unknown as ChildProcess;
        return mockCheckProcess;
      } else {
        // Second call is the actual modelaudit scan
        const mockScanProcess = {
          on: jest.fn((event, callback) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        } as unknown as ChildProcess;
        return mockScanProcess;
      }
    });

    modelScanCommand(program);

    // Parse the command with the program, not the command directly
    await program.parseAsync([
      'node',
      'test',
      'scan-model',
      'path/to/model1',
      'path/to/model2',
      '--blacklist',
      '*.log',
      '--format',
      'json',
      '--output',
      'report.json',
      '--timeout',
      '300',
      '--verbose',
      '--max-file-size',
      '100MB',
      '--max-total-size',
      '1GB',
    ]);

    // Check the actual scan spawn call
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'modelaudit', ['--version'], {
      stdio: 'ignore',
      shell: true,
    });
    expect(mockSpawn).toHaveBeenNthCalledWith(
      2,
      'modelaudit',
      [
        'scan',
        'path/to/model1',
        'path/to/model2',
        '--blacklist',
        '*.log',
        '--format',
        'json',
        '--output',
        'report.json',
        '--timeout',
        '300',
        '--verbose',
        '--max-file-size',
        '100MB',
        '--max-total-size',
        '1GB',
      ],
      { stdio: 'inherit' },
    );
  });

  it('should handle non-zero exit code', async () => {
    // Mock for checkModelAuditInstalled call
    let isFirstCall = true;
    mockSpawn.mockImplementation((command, args, options) => {
      if (isFirstCall) {
        // First call is checkModelAuditInstalled
        isFirstCall = false;
        const mockCheckProcess = {
          on: jest.fn((event, callback) => {
            if (event === 'exit') {
              callback(0);
            }
          }),
        } as unknown as ChildProcess;
        return mockCheckProcess;
      } else {
        // Second call is the actual modelaudit scan
        const mockScanProcess = {
          on: jest.fn((event, callback) => {
            if (event === 'close') {
              callback(1);
            }
          }),
        } as unknown as ChildProcess;
        return mockScanProcess;
      }
    });

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('Model scan completed with issues. Exit code: 1');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

describe('checkModelAuditInstalled', () => {
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    mockSpawn = jest.mocked(spawn);
    jest.clearAllMocks();
  });

  it('should return true if modelaudit is installed', async () => {
    const mockChildProcess = {
      on: jest.fn((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
      }),
    } as unknown as ChildProcess;
    mockSpawn.mockReturnValue(mockChildProcess);

    const result = await checkModelAuditInstalled();
    expect(result).toBe(true);
  });

  it('should return false if modelaudit is not installed', async () => {
    const mockChildProcess = {
      on: jest.fn((event, callback) => {
        if (event === 'error') {
          callback(new Error('command not found'));
        }
      }),
    } as unknown as ChildProcess;
    mockSpawn.mockReturnValue(mockChildProcess);

    const result = await checkModelAuditInstalled();
    expect(result).toBe(false);
  });
});
