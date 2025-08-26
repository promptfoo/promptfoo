import { type ChildProcess, spawn } from 'child_process';

import { Command } from 'commander';
import { checkModelAuditInstalled, modelScanCommand } from '../../src/commands/modelScan';
import logger from '../../src/logger';

jest.mock('child_process');
jest.mock('../../src/logger');
jest.mock('../../src/models/modelAudit', () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' }),
  },
}));
jest.mock('../../src/updates', () => ({
  checkModelAuditUpdates: jest.fn().mockResolvedValue(undefined),
}));

describe('modelScanCommand', () => {
  let program: Command;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should exit if no paths are provided', async () => {
    // Mock for checkModelAuditInstalled (modelaudit --version)
    const versionCheckProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0); // Simulate successful version check
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    // Mock for any potential scan process (shouldn't be reached but needed for safety)
    const mockScanProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    } as unknown as ChildProcess;

    // Set up spawn mock: first for version check, then default for any other calls
    (spawn as unknown as jest.Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValue(mockScanProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model']);

    expect(logger.error).toHaveBeenCalledWith(
      'No paths specified. Please provide at least one model file or directory to scan.',
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit if modelaudit is not installed', async () => {
    // Mock for checkModelAuditInstalled (modelaudit --version) - simulate not installed
    const versionCheckProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          callback(new Error('command not found'));
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    // Mock for any potential scan process (shouldn't be reached but needed for safety)
    const mockScanProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    } as unknown as ChildProcess;

    // Set up spawn mock: first for version check, then default for any other calls
    (spawn as unknown as jest.Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValue(mockScanProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('ModelAudit is not installed.');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should spawn modelaudit process with correct arguments', async () => {
    // Mock for checkModelAuditInstalled (modelaudit --version)
    const versionCheckProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    const mockChildProcess = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    // First call for version check, second for actual scan
    (spawn as unknown as jest.Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(mockChildProcess);

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
      '--no-write', // Changed from --no-save to --no-write to match the actual command option
      '--progress-format',
      'tqdm',
      '--progress-interval',
      '2.0',
    ]);

    expect(spawn).toHaveBeenCalledWith('modelaudit', ['--version']);
    expect(spawn).toHaveBeenCalledWith(
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
        '--selective',
        '--no-skip-files',
        '--progress-format',
        'tqdm',
        '--progress-interval',
        '2.0',
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          PROMPTFOO_DELEGATED: 'true',
        },
      },
    );
  });

  it('should handle modelaudit process error', async () => {
    // Mock for checkModelAuditInstalled (modelaudit --version)
    const versionCheckProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    const mockChildProcess = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          callback(new Error('spawn error'));
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    // First call for version check, second for actual scan
    (spawn as unknown as jest.Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('Failed to start modelaudit: spawn error');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle exit code 1 (scan completed with issues)', async () => {
    // Mock for checkModelAuditInstalled (modelaudit --version)
    const versionCheckProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    const mockOutput = JSON.stringify({
      total_checks: 10,
      passed_checks: 8,
      failed_checks: 2,
      files_scanned: 5,
      bytes_scanned: 1024,
      duration: 1000,
      has_errors: true,
      issues: [
        {
          severity: 'error',
          message: 'Test issue 1',
          location: 'test/file1.py',
        },
        {
          severity: 'warning',
          message: 'Test issue 2',
          location: 'test/file2.py',
        },
      ],
    });

    const mockChildProcess = {
      stdout: {
        on: jest.fn().mockImplementation((event: string, callback: any) => {
          if (event === 'data') {
            callback(Buffer.from(mockOutput));
          }
        }),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(1);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    // First call for version check, second for actual scan
    (spawn as unknown as jest.Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model']);

    // When saving to database (default), the command just exits with the code
    // without logging a specific error message for exit code 1
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle exit code 2 (scan process error)', async () => {
    // Mock for checkModelAuditInstalled (modelaudit --version)
    const versionCheckProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    const mockChildProcess = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn().mockImplementation((event: string, callback: any) => {
          if (event === 'data') {
            callback(Buffer.from('Some error output'));
          }
        }),
      },
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(2);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    // First call for version check, second for actual scan
    (spawn as unknown as jest.Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model']);

    expect(logger.error).toHaveBeenCalledWith('Model scan process exited with code 2');
    expect(logger.error).toHaveBeenCalledWith('Error output: Some error output');
    expect(mockExit).toHaveBeenCalledWith(2);
  });
});

describe('checkModelAuditInstalled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true if modelaudit is installed', async () => {
    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(0);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as jest.Mock).mockReturnValue(mockChildProcess);

    const result = await checkModelAuditInstalled();
    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith('modelaudit', ['--version']);
  });

  it('should return false if modelaudit is not installed', async () => {
    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          callback(new Error('command not found'));
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as jest.Mock).mockReturnValue(mockChildProcess);

    const result = await checkModelAuditInstalled();
    expect(result).toBe(false);
    expect(spawn).toHaveBeenCalledWith('modelaudit', ['--version']);
  });

  it('should return true if modelaudit exits with code 1', async () => {
    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(1);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as jest.Mock).mockReturnValue(mockChildProcess);

    const result = await checkModelAuditInstalled();
    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith('modelaudit', ['--version']);
  });

  it('should return false if modelaudit exits with non-0/1 code', async () => {
    const mockChildProcess = {
      on: jest.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          callback(2);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as jest.Mock).mockReturnValue(mockChildProcess);

    const result = await checkModelAuditInstalled();
    expect(result).toBe(false);
    expect(spawn).toHaveBeenCalledWith('modelaudit', ['--version']);
  });
});
