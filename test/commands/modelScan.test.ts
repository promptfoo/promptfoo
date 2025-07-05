import { spawn, type ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { Command } from 'commander';
import { modelScanCommand, checkModelAuditInstalled } from '../../src/commands/modelScan';
import logger from '../../src/logger';

jest.mock('child_process');
jest.mock('../../src/logger');

describe('modelScanCommand', () => {
  let program: Command;
  let mockSpawn: jest.SpyInstance;
  let mockExec: jest.SpyInstance;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    mockSpawn = jest.spyOn({ spawn }, 'spawn');
    mockExec = jest.spyOn({ exec }, 'exec');
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should exit if no paths are provided', async () => {
    const mockChildProcess = {
      on: jest.fn(),
    } as unknown as ChildProcess;
    mockSpawn.mockReturnValue(mockChildProcess);
    mockExec.mockImplementation((cmd, callback) => {
      if (callback) {
        callback(null, '', '');
      }
      return undefined;
    });

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model']);

    expect(logger.error).toHaveBeenCalledWith(
      'No paths specified. Please provide at least one model file or directory to scan.',
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit if modelaudit is not installed', async () => {
    const mockChildProcess = {
      on: jest.fn(),
    } as unknown as ChildProcess;
    mockSpawn.mockReturnValue(mockChildProcess);
    mockExec.mockImplementation((cmd, callback) => {
      if (callback) {
        callback(new Error('command not found'), '', '');
      }
      return undefined;
    });

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('ModelAudit is not installed.');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should spawn modelaudit process with correct arguments', async () => {
    mockExec.mockImplementation((cmd, callback) => {
      if (callback) {
        callback(null, '', '');
      }
      return undefined;
    });

    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync([
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

    expect(mockSpawn).toHaveBeenCalledWith(
      'modelaudit',
      [
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
      ],
      { stdio: 'inherit' },
    );
  });

  it('should handle modelaudit process error', async () => {
    mockExec.mockImplementation((cmd, callback) => {
      if (callback) {
        callback(null, '', '');
      }
      return undefined;
    });

    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          callback(new Error('spawn error'));
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('Failed to start modelaudit: spawn error');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle non-zero exit code', async () => {
    mockExec.mockImplementation((cmd, callback) => {
      if (callback) {
        callback(null, '', '');
      }
      return undefined;
    });

    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(1);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    mockSpawn.mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('Model scan completed with issues. Exit code: 1');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

describe('checkModelAuditInstalled', () => {
  let mockExec: jest.SpyInstance;

  beforeEach(() => {
    mockExec = jest.spyOn({ exec }, 'exec');
  });

  it('should return true if modelaudit is installed', async () => {
    mockExec.mockImplementation((cmd, callback) => {
      if (callback) {
        callback(null, '', '');
      }
      return undefined;
    });

    const result = await checkModelAuditInstalled();
    expect(result).toBe(true);
  });

  it('should return false if modelaudit is not installed', async () => {
    mockExec.mockImplementation((cmd, callback) => {
      if (callback) {
        callback(new Error('command not found'), '', '');
      }
      return undefined;
    });

    const result = await checkModelAuditInstalled();
    expect(result).toBe(false);
  });
});
