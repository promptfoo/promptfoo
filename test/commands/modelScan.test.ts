import { Mock, MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChildProcess, spawn } from 'child_process';

import { Command } from 'commander';
import { checkModelAuditInstalled, modelScanCommand } from '../../src/commands/modelScan';
import logger from '../../src/logger';

vi.mock('child_process');
vi.mock('../../src/logger');
vi.mock('../../src/models/modelAudit', () => ({
  __esModule: true,
  default: {
    create: vi.fn().mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' }),
    findByRevision: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../../src/updates', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    checkModelAuditUpdates: vi.fn().mockResolvedValue(undefined),
    getModelAuditCurrentVersion: vi.fn().mockResolvedValue('0.2.16'),
  };
});
vi.mock('../../src/util/huggingfaceMetadata', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    isHuggingFaceModel: vi.fn().mockReturnValue(false),
    getHuggingFaceMetadata: vi.fn().mockResolvedValue(null),
    parseHuggingFaceModel: vi.fn().mockReturnValue(null),
  };
});

describe('modelScanCommand', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(() => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should exit if no paths are provided', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Still need spawn mock since Commander may try to execute the command action

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    // Parse without path argument - Commander requires paths but the action should handle this
    try {
      await command?.parseAsync(['scan-model']);
    } catch {
      // Commander may throw for missing required argument
    }

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'No paths specified. Please provide at least one model file or directory to scan.',
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    loggerErrorSpy.mockRestore();
  });

  it('should exit if modelaudit is not installed', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // Mock getModelAuditCurrentVersion to return null (not installed)
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    (getModelAuditCurrentVersion as Mock).mockResolvedValueOnce(null);

    // Mock for fallback spawn check - simulate not installed
    const versionCheckProcess = {
      stdout: { on: vi.fn() },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'error') {
          callback(new Error('command not found'));
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(versionCheckProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(loggerErrorSpy).toHaveBeenCalledWith('ModelAudit is not installed.');
    expect(mockExit).toHaveBeenCalledWith(1);

    loggerErrorSpy.mockRestore();
  });

  it('should spawn modelaudit process with correct arguments', async () => {
    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)

    const mockChildProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(0);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockChildProcess);

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
      '--timeout',
      '600',
      '--verbose',
      '--max-size',
      '1GB',
      '--strict',
      '--dry-run',
      '--quiet',
      '--progress',
    ]);

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
        '--verbose',
        '--quiet',
        '--strict',
        '--progress',
        '--timeout',
        '600',
        '--max-size',
        '1GB',
        '--dry-run',
      ],
      {
        env: {
          ...process.env,
          PROMPTFOO_DELEGATED: 'true',
        },
      },
    );
  });

  it('should handle modelaudit process error', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)

    const mockChildProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'error') {
          callback(new Error('spawn error'));
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['scan-model', 'path/to/model']);

    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to start modelaudit: spawn error');
    expect(mockExit).toHaveBeenCalledWith(1);

    loggerErrorSpy.mockRestore();
  });

  it('should handle exit code 1 (scan completed with issues)', async () => {
    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)

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
        on: vi.fn().mockImplementation(function (event: string, callback: any) {
          if (event === 'data') {
            callback(Buffer.from(mockOutput));
          }
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(1);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model']);

    // When saving to database (default), the command just exits with the code
    // without logging a specific error message for exit code 1
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle exit code 2 (scan process error)', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)

    const mockChildProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn().mockImplementation(function (event: string, callback: any) {
          if (event === 'data') {
            callback(Buffer.from('Some error output'));
          }
        }),
      },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(2);
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model']);

    expect(loggerErrorSpy).toHaveBeenCalledWith('Model scan process exited with code 2');
    expect(loggerErrorSpy).toHaveBeenCalledWith('Error output: Some error output');
    expect(mockExit).toHaveBeenCalledWith(2);

    loggerErrorSpy.mockRestore();
  });
});

describe('Re-scan on version change behavior', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(() => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should skip scan when model already scanned with same version', async () => {
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    const { getModelAuditCurrentVersion } = await import('../../src/updates');

    // Mock HuggingFace model detection
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      sha: 'abc123',
      siblings: [],
    });

    // Mock existing scan with same version (0.2.16)
    (ModelAudit.findByRevision as Mock).mockResolvedValue({
      id: 'existing-scan-id',
      scannerVersion: '0.2.16',
      createdAt: Date.now(),
    });

    // Mock getModelAuditCurrentVersion to return same version (0.2.16)
    (getModelAuditCurrentVersion as Mock).mockResolvedValue('0.2.16');

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    // Should exit early without scanning (exit code 0)
    expect(mockExit).not.toHaveBeenCalled();
    // Should not call spawn for actual scan (version check uses getModelAuditCurrentVersion)
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should re-scan when scanner version has changed', async () => {
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    const { getModelAuditCurrentVersion } = await import('../../src/updates');

    // Mock HuggingFace model detection
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      sha: 'abc123',
      siblings: [],
    });

    // Mock existing scan with OLD version (0.2.10)
    const existingAudit = {
      id: 'existing-scan-id',
      scannerVersion: '0.2.10',
      createdAt: Date.now(),
      results: {},
      save: vi.fn().mockResolvedValue(undefined),
    };
    (ModelAudit.findByRevision as Mock).mockResolvedValue(existingAudit);

    // Mock getModelAuditCurrentVersion to return NEW version 0.2.16
    (getModelAuditCurrentVersion as Mock).mockResolvedValue('0.2.16');

    // Mock scan process that returns valid JSON
    const mockScanOutput = JSON.stringify({
      total_checks: 10,
      passed_checks: 10,
      failed_checks: 0,
      files_scanned: 5,
      bytes_scanned: 1024,
      duration: 1000,
    });

    const mockScanProcess = {
      stdout: {
        on: vi.fn().mockImplementation(function (event: string, callback: any) {
          if (event === 'data') {
            callback(Buffer.from(mockScanOutput));
          }
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(0);
        }
        return mockScanProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockScanProcess);

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    // Should have called spawn once for the actual scan
    expect(spawn).toHaveBeenCalledTimes(1);
    // Should have updated the existing audit's scanner version
    expect(existingAudit.save).toHaveBeenCalled();
    expect(existingAudit.scannerVersion).toBe('0.2.16');
  });

  it('should re-scan when previous scan has no version info', async () => {
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    const { getModelAuditCurrentVersion } = await import('../../src/updates');

    // Mock HuggingFace model detection
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      sha: 'abc123',
      siblings: [],
    });

    // Mock existing scan with NO version (null)
    const existingAudit = {
      id: 'existing-scan-id',
      scannerVersion: null,
      createdAt: Date.now(),
      results: {},
      save: vi.fn().mockResolvedValue(undefined),
    };
    (ModelAudit.findByRevision as Mock).mockResolvedValue(existingAudit);

    // Mock getModelAuditCurrentVersion to return version 0.2.16
    (getModelAuditCurrentVersion as Mock).mockResolvedValue('0.2.16');

    // Mock scan process
    const mockScanOutput = JSON.stringify({
      total_checks: 10,
      passed_checks: 10,
      failed_checks: 0,
      files_scanned: 5,
      bytes_scanned: 1024,
      duration: 1000,
    });

    const mockScanProcess = {
      stdout: {
        on: vi.fn().mockImplementation(function (event: string, callback: any) {
          if (event === 'data') {
            callback(Buffer.from(mockScanOutput));
          }
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(0);
        }
        return mockScanProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockScanProcess);

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    // Should have called spawn once for the scan
    expect(spawn).toHaveBeenCalledTimes(1);
    // Should have updated the existing audit with new version
    expect(existingAudit.save).toHaveBeenCalled();
    expect(existingAudit.scannerVersion).toBe('0.2.16');
  });
});

describe('checkModelAuditInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return installed: true and version when getModelAuditCurrentVersion returns version', async () => {
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    (getModelAuditCurrentVersion as Mock).mockResolvedValue('0.2.16');

    const result = await checkModelAuditInstalled();
    expect(result).toEqual({ installed: true, version: '0.2.16' });
    // Should not need to spawn since getModelAuditCurrentVersion returned a version
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should return installed: false when modelaudit is not installed', async () => {
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    (getModelAuditCurrentVersion as Mock).mockResolvedValue(null);

    const result = await checkModelAuditInstalled();
    expect(result).toEqual({ installed: false, version: null });
  });

  it('should handle different version formats from getModelAuditCurrentVersion', async () => {
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    (getModelAuditCurrentVersion as Mock).mockResolvedValue('1.0.0');

    const result = await checkModelAuditInstalled();
    expect(result).toEqual({ installed: true, version: '1.0.0' });
  });

  it('should return installed: true with version even when fallback would return exit code 1', async () => {
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    // getModelAuditCurrentVersion returns version successfully
    (getModelAuditCurrentVersion as Mock).mockResolvedValue('0.2.19');

    const result = await checkModelAuditInstalled();
    expect(result).toEqual({ installed: true, version: '0.2.19' });
    // No fallback needed
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('Command Options Validation', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(() => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should register only supported CLI options', () => {
    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    expect(command).toBeDefined();

    const options = command?.options || [];
    const optionNames = options.map((opt) => opt.long);

    // Valid options that should be present
    const validOptions = [
      '--blacklist',
      '--output',
      '--format',
      '--sbom',
      '--no-write',
      '--name',
      '--timeout',
      '--max-size',
      '--strict',
      '--dry-run',
      '--no-cache',
      '--quiet',
      '--progress',
      '--stream',
      '--verbose',
    ];

    validOptions.forEach((option) => {
      expect(optionNames).toContain(option);
    });

    // Invalid options that should NOT be present
    const invalidOptions = [
      '--registry-uri',
      '--max-file-size',
      '--max-total-size',
      '--jfrog-api-token',
      '--jfrog-access-token',
      '--max-download-size',
      '--cache-dir',
      '--preview',
      '--all-files',
      '--selective',
      '--scan-and-delete',
      '--skip-files',
      '--no-skip-files',
      '--strict-license',
      '--no-large-model-support',
      '--no-progress',
      '--progress-log',
      '--progress-format',
      '--progress-interval',
    ];

    invalidOptions.forEach((option) => {
      expect(optionNames).not.toContain(option);
    });
  });

  it('should only pass valid arguments to modelaudit', async () => {
    // Mock for checkModelAuditInstalled (returns { installed, version })
    const versionCheckProcess = {
      stdout: {
        on: vi.fn().mockImplementation(function (event: string, callback: any) {
          if (event === 'data') {
            callback(Buffer.from('modelaudit, version 0.2.16\n'));
          }
        }),
      },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(0);
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    const mockScanProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(0);
        }
        return mockScanProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(mockScanProcess);

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync([
      'node',
      'scan-model',
      'model.pkl',
      '--blacklist',
      'pattern1',
      '--max-size',
      '1GB',
      '--strict',
      '--dry-run',
      '--no-cache',
      '--no-write',
    ]);

    const spawnCalls = (spawn as Mock).mock.calls;
    const scanCall = spawnCalls.find((call) => call[1].includes('scan'));
    expect(scanCall).toBeDefined();

    const args = scanCall![1] as string[];

    // Should contain valid arguments
    expect(args).toContain('--blacklist');
    expect(args).toContain('pattern1');
    expect(args).toContain('--max-size');
    expect(args).toContain('1GB');
    expect(args).toContain('--strict');
    expect(args).toContain('--dry-run');
    expect(args).toContain('--no-cache');

    // Should NOT contain invalid arguments
    expect(args).not.toContain('--max-file-size');
    expect(args).not.toContain('--preview');
    expect(args).not.toContain('--registry-uri');
    expect(args).not.toContain('--jfrog-api-token');
  });

  it('should handle multiple blacklist patterns correctly', async () => {
    // Mock for checkModelAuditInstalled (returns { installed, version })
    const versionCheckProcess = {
      stdout: {
        on: vi.fn().mockImplementation(function (event: string, callback: any) {
          if (event === 'data') {
            callback(Buffer.from('modelaudit, version 0.2.16\n'));
          }
        }),
      },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(0);
        }
        return versionCheckProcess;
      }),
    } as unknown as ChildProcess;

    const mockScanProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(0);
        }
        return mockScanProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(mockScanProcess);

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync([
      'node',
      'scan-model',
      'model.pkl',
      '--blacklist',
      'pattern1',
      '--blacklist',
      'pattern2',
      '--blacklist',
      'pattern3',
      '--no-write',
    ]);

    const spawnCalls = (spawn as Mock).mock.calls;
    const scanCall = spawnCalls.find((call) => call[1].includes('scan'));
    const args = scanCall![1] as string[];

    // Should contain all blacklist patterns
    expect(args).toContain('--blacklist');
    expect(args).toContain('pattern1');
    expect(args).toContain('pattern2');
    expect(args).toContain('pattern3');

    // Should have correct sequence
    const blacklistIndices = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--blacklist') {
        blacklistIndices.push(i);
      }
    }
    expect(blacklistIndices).toHaveLength(3);
    expect(args[blacklistIndices[0] + 1]).toBe('pattern1');
    expect(args[blacklistIndices[1] + 1]).toBe('pattern2');
    expect(args[blacklistIndices[2] + 1]).toBe('pattern3');
  });
});
