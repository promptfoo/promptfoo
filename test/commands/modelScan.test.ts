import { type ChildProcess, spawn } from 'child_process';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, Mock, MockInstance, vi } from 'vitest';
import { checkModelAuditInstalled, modelScanCommand } from '../../src/commands/modelScan';
import logger from '../../src/logger';

vi.mock('child_process');
vi.mock('../../src/logger');
vi.mock('../../src/share', () => ({
  createShareableModelAuditUrl: vi
    .fn()
    .mockResolvedValue('https://app.promptfoo.dev/model-audit/test-id'),
  isModelAuditSharingEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));
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

  beforeEach(async () => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();

    // Reset mock implementations (clearAllMocks only clears call history, not implementations)
    vi.mocked(spawn).mockReset();
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    vi.mocked(getModelAuditCurrentVersion).mockReset();
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.16');

    // Reset ModelAudit mock to default (no existing scan found)
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    vi.mocked(ModelAudit.findByRevision).mockReset();
    vi.mocked(ModelAudit.findByRevision).mockResolvedValue(null);
    vi.mocked(ModelAudit.create).mockReset();
    vi.mocked(ModelAudit.create).mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' } as any);

    // Reset HuggingFace mocks
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    vi.mocked(isHuggingFaceModel).mockReset();
    vi.mocked(isHuggingFaceModel).mockReturnValue(false);
    vi.mocked(getHuggingFaceMetadata).mockReset();
    vi.mocked(getHuggingFaceMetadata).mockResolvedValue(null);
    vi.mocked(parseHuggingFaceModel).mockReset();
    vi.mocked(parseHuggingFaceModel).mockReturnValue(null);
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
      await command?.parseAsync(['node', 'scan-model']);
    } catch {
      // Commander may throw for missing required argument
    }

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'No paths specified. Provide at least one model file or directory to scan.',
    );
    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(1);

    // Reset exitCode for other tests
    process.exitCode = 0;
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
      killed: false,
      kill: vi.fn(),
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
    // Use try/catch because the error in spawn now causes rejection
    try {
      await command?.parseAsync(['node', 'scan-model', 'path/to/model']);
    } catch {
      // Expected - error event causes rejection
    }

    expect(loggerErrorSpy).toHaveBeenCalledWith('ModelAudit is not installed.');
    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(1);

    // Reset exitCode for other tests
    process.exitCode = 0;
    loggerErrorSpy.mockRestore();
  });

  it('should spawn modelaudit process with correct arguments (--no-write mode)', async () => {
    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Using --no-write to test pass-through mode without temp file handling

    const mockChildProcess = {
      killed: false,
      kill: vi.fn(),
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
      '--no-write', // Skip database save to test pass-through mode
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
        stdio: 'inherit',
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
      killed: false,
      kill: vi.fn(),
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
    // Use try/catch because error event now rejects the promise
    try {
      await command?.parseAsync(['node', 'scan-model', 'path/to/model']);
    } catch {
      // Expected - error event causes rejection
    }

    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to start modelaudit: spawn error');
    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(1);

    // Reset exitCode for other tests
    process.exitCode = 0;
    loggerErrorSpy.mockRestore();
  });

  it('should handle exit code 1 (scan completed with issues) in --no-write mode', async () => {
    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Using --no-write to test pass-through mode

    const mockChildProcess = {
      killed: false,
      kill: vi.fn(),
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(1); // Exit code 1 means issues found but scan completed
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockChildProcess);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model', '--no-write']);

    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(1);

    // Reset exitCode for other tests
    process.exitCode = 0;
  });

  it('should handle exit code 2 (scan process error) in --no-write mode', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Using --no-write to test pass-through mode

    const mockChildProcess = {
      killed: false,
      kill: vi.fn(),
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
    await command?.parseAsync(['node', 'scan-model', 'path/to/model', '--no-write']);

    expect(loggerErrorSpy).toHaveBeenCalledWith('Model scan process exited with code 2');
    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(2);

    // Reset exitCode for other tests
    process.exitCode = 0;
    loggerErrorSpy.mockRestore();
  });
});

describe('Re-scan on version change behavior', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(async () => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();

    // Reset mock implementations (clearAllMocks only clears call history, not implementations)
    vi.mocked(spawn).mockReset();
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    vi.mocked(getModelAuditCurrentVersion).mockReset();
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.16');

    // Reset ModelAudit mock to default (no existing scan found)
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    vi.mocked(ModelAudit.findByRevision).mockReset();
    vi.mocked(ModelAudit.findByRevision).mockResolvedValue(null);
    vi.mocked(ModelAudit.create).mockReset();
    vi.mocked(ModelAudit.create).mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' } as any);

    // Reset HuggingFace mocks
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    vi.mocked(isHuggingFaceModel).mockReset();
    vi.mocked(isHuggingFaceModel).mockReturnValue(false);
    vi.mocked(getHuggingFaceMetadata).mockReset();
    vi.mocked(getHuggingFaceMetadata).mockResolvedValue(null);
    vi.mocked(parseHuggingFaceModel).mockReset();
    vi.mocked(parseHuggingFaceModel).mockReturnValue(null);
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
      killed: false,
      kill: vi.fn(),
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

    // Should have called spawn once for the actual scan (proves re-scan was triggered)
    expect(spawn).toHaveBeenCalledTimes(1);
    // Note: save() is called after processing results from temp file,
    // which requires fs mocking that's complex in ESM. The spawn call proves re-scan triggered.
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
      killed: false,
      kill: vi.fn(),
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

    // Should have called spawn once for the scan (proves re-scan was triggered)
    expect(spawn).toHaveBeenCalledTimes(1);
    // Note: save() is called after processing results from temp file,
    // which requires fs mocking that's complex in ESM. The spawn call proves re-scan triggered.
  });
});

describe('checkModelAuditInstalled', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementations (clearAllMocks only clears call history, not implementations)
    vi.mocked(spawn).mockReset();
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    vi.mocked(getModelAuditCurrentVersion).mockReset();
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.16');

    // Reset ModelAudit mock to default (no existing scan found)
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    vi.mocked(ModelAudit.findByRevision).mockReset();
    vi.mocked(ModelAudit.findByRevision).mockResolvedValue(null);
    vi.mocked(ModelAudit.create).mockReset();
    vi.mocked(ModelAudit.create).mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' } as any);

    // Reset HuggingFace mocks
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    vi.mocked(isHuggingFaceModel).mockReset();
    vi.mocked(isHuggingFaceModel).mockReturnValue(false);
    vi.mocked(getHuggingFaceMetadata).mockReset();
    vi.mocked(getHuggingFaceMetadata).mockResolvedValue(null);
    vi.mocked(parseHuggingFaceModel).mockReset();
    vi.mocked(parseHuggingFaceModel).mockReturnValue(null);
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

  beforeEach(async () => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();

    // Reset mock implementations (clearAllMocks only clears call history, not implementations)
    vi.mocked(spawn).mockReset();
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    vi.mocked(getModelAuditCurrentVersion).mockReset();
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.16');

    // Reset ModelAudit mock to default (no existing scan found)
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    vi.mocked(ModelAudit.findByRevision).mockReset();
    vi.mocked(ModelAudit.findByRevision).mockResolvedValue(null);
    vi.mocked(ModelAudit.create).mockReset();
    vi.mocked(ModelAudit.create).mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' } as any);

    // Reset HuggingFace mocks
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    vi.mocked(isHuggingFaceModel).mockReset();
    vi.mocked(isHuggingFaceModel).mockReturnValue(false);
    vi.mocked(getHuggingFaceMetadata).mockReset();
    vi.mocked(getHuggingFaceMetadata).mockResolvedValue(null);
    vi.mocked(parseHuggingFaceModel).mockReset();
    vi.mocked(parseHuggingFaceModel).mockReturnValue(null);
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
      killed: false,
      kill: vi.fn(),
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
      killed: false,
      kill: vi.fn(),
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

describe('Temp file JSON output (CLI UI fix)', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(async () => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();

    // Reset mock implementations (clearAllMocks only clears call history, not implementations)
    vi.mocked(spawn).mockReset();
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    vi.mocked(getModelAuditCurrentVersion).mockReset();
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.16');

    // Reset ModelAudit mock to default (no existing scan found)
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    vi.mocked(ModelAudit.findByRevision).mockReset();
    vi.mocked(ModelAudit.findByRevision).mockResolvedValue(null);
    vi.mocked(ModelAudit.create).mockReset();
    vi.mocked(ModelAudit.create).mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' } as any);

    // Reset HuggingFace mocks
    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    vi.mocked(isHuggingFaceModel).mockReset();
    vi.mocked(isHuggingFaceModel).mockReturnValue(false);
    vi.mocked(getHuggingFaceMetadata).mockReset();
    vi.mocked(getHuggingFaceMetadata).mockResolvedValue(null);
    vi.mocked(parseHuggingFaceModel).mockReset();
    vi.mocked(parseHuggingFaceModel).mockReturnValue(null);
  });

  afterEach(() => {
    mockExit.mockRestore();
    process.exitCode = 0;
  });

  it('should use inherited stdio when --no-write is specified', async () => {
    // Mock inherited stdio process (captureOutput: false)
    const mockChildProcess = {
      killed: false,
      kill: vi.fn(),
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

    // Use --no-write to skip database save and use passthrough mode
    await command.parseAsync(['node', 'scan-model', 'model.pkl', '--no-write']);

    // Should spawn with inherited stdio for passthrough mode
    const spawnCalls = (spawn as Mock).mock.calls;
    const scanCall = spawnCalls.find((call) => call[1].includes('scan'));
    expect(scanCall).toBeDefined();

    // Should use inherited stdio (no stdout/stderr capture)
    const spawnOptions = scanCall![2];
    expect(spawnOptions).toEqual({
      stdio: 'inherit',
      env: expect.objectContaining({
        PROMPTFOO_DELEGATED: 'true',
      }),
    });
  });

  it('should not use temp file --output flag when --no-write is specified', async () => {
    const mockChildProcess = {
      killed: false,
      kill: vi.fn(),
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

    await command.parseAsync(['node', 'scan-model', 'model.pkl', '--no-write']);

    // When not saving to database, should NOT add temp file --output
    const spawnCalls = (spawn as Mock).mock.calls;
    const scanCall = spawnCalls.find((call) => call[1].includes('scan'));
    const args = scanCall![1] as string[];

    // Should not have temp file output (no promptfoo-modelscan in path)
    const outputIndex = args.indexOf('--output');
    if (outputIndex !== -1) {
      const outputPath = args[outputIndex + 1];
      expect(outputPath).not.toMatch(/promptfoo-modelscan/);
    }
  });

  it('should handle exit code 2 (error) and not crash', async () => {
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const mockChildProcess = {
      killed: false,
      kill: vi.fn(),
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(2); // Error exit code
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;

    (spawn as unknown as Mock).mockReturnValue(mockChildProcess);

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync(['node', 'scan-model', 'model.pkl', '--no-write']);

    expect(loggerErrorSpy).toHaveBeenCalledWith('Model scan process exited with code 2');
    expect(process.exitCode).toBe(2);

    loggerErrorSpy.mockRestore();
  });
});

describe('Sharing behavior', () => {
  let program: Command;
  let mockExit: MockInstance;
  let createShareableModelAuditUrlMock: Mock;
  let isModelAuditSharingEnabledMock: Mock;
  let cloudConfigIsEnabledMock: Mock;

  beforeEach(async () => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });
    vi.clearAllMocks();

    // Get mocks
    const shareModule = await import('../../src/share');
    createShareableModelAuditUrlMock = vi.mocked(shareModule.createShareableModelAuditUrl);
    isModelAuditSharingEnabledMock = vi.mocked(shareModule.isModelAuditSharingEnabled);
    createShareableModelAuditUrlMock.mockReset();
    createShareableModelAuditUrlMock.mockResolvedValue(
      'https://app.promptfoo.dev/model-audit/test-id',
    );
    isModelAuditSharingEnabledMock.mockReset();
    isModelAuditSharingEnabledMock.mockReturnValue(false);

    const cloudModule = await import('../../src/globalConfig/cloud');
    cloudConfigIsEnabledMock = vi.mocked(cloudModule.cloudConfig.isEnabled);
    cloudConfigIsEnabledMock.mockReset();
    cloudConfigIsEnabledMock.mockReturnValue(false);

    // Reset other mocks
    vi.mocked(spawn).mockReset();
    const { getModelAuditCurrentVersion } = await import('../../src/updates');
    vi.mocked(getModelAuditCurrentVersion).mockReset();
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.16');

    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    vi.mocked(ModelAudit.findByRevision).mockReset();
    vi.mocked(ModelAudit.findByRevision).mockResolvedValue(null);
    vi.mocked(ModelAudit.create).mockReset();
    vi.mocked(ModelAudit.create).mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' } as any);

    const { isHuggingFaceModel, getHuggingFaceMetadata, parseHuggingFaceModel } = await import(
      '../../src/util/huggingfaceMetadata'
    );
    vi.mocked(isHuggingFaceModel).mockReset();
    vi.mocked(isHuggingFaceModel).mockReturnValue(false);
    vi.mocked(getHuggingFaceMetadata).mockReset();
    vi.mocked(getHuggingFaceMetadata).mockResolvedValue(null);
    vi.mocked(parseHuggingFaceModel).mockReset();
    vi.mocked(parseHuggingFaceModel).mockReturnValue(null);
  });

  afterEach(() => {
    mockExit.mockRestore();
    process.exitCode = 0;
    delete process.env.PROMPTFOO_DISABLE_SHARING;
  });

  // Helper to create a mock scan process that returns valid JSON results
  function createMockScanProcess(exitCode = 0) {
    const mockScanOutput = JSON.stringify({
      total_checks: 10,
      passed_checks: 10,
      failed_checks: 0,
      files_scanned: 5,
      bytes_scanned: 1024,
      duration: 1000,
    });

    const mockProcess = {
      stdout: {
        on: vi.fn().mockImplementation(function (event: string, callback: any) {
          if (event === 'data') {
            callback(Buffer.from(mockScanOutput));
          }
        }),
      },
      stderr: { on: vi.fn() },
      killed: false,
      kill: vi.fn(),
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          callback(exitCode);
        }
        return mockProcess;
      }),
    } as unknown as ChildProcess;

    return mockProcess;
  }

  it('should not share when PROMPTFOO_DISABLE_SHARING env var is set', async () => {
    process.env.PROMPTFOO_DISABLE_SHARING = 'true';
    cloudConfigIsEnabledMock.mockReturnValue(true);
    isModelAuditSharingEnabledMock.mockReturnValue(true);

    (spawn as unknown as Mock).mockReturnValue(createMockScanProcess());

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync(['node', 'scan-model', 'model.pkl']);

    expect(createShareableModelAuditUrlMock).not.toHaveBeenCalled();
  });

  it('should not share when --no-share flag is passed (via share=false)', async () => {
    cloudConfigIsEnabledMock.mockReturnValue(true);
    isModelAuditSharingEnabledMock.mockReturnValue(true);

    (spawn as unknown as Mock).mockReturnValue(createMockScanProcess());

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    // Commander.js sets share=false when --no-share is used
    await command.parseAsync(['node', 'scan-model', 'model.pkl', '--no-share']);

    expect(createShareableModelAuditUrlMock).not.toHaveBeenCalled();
  });

  it('should share when --share flag is passed and sharing is enabled', async () => {
    cloudConfigIsEnabledMock.mockReturnValue(false); // Cloud not enabled by default
    isModelAuditSharingEnabledMock.mockReturnValue(true); // But sharing is possible (custom URL)

    (spawn as unknown as Mock).mockReturnValue(createMockScanProcess());

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync(['node', 'scan-model', 'model.pkl', '--share']);

    expect(createShareableModelAuditUrlMock).toHaveBeenCalled();
  });

  it('should auto-share by default when cloud is enabled', async () => {
    cloudConfigIsEnabledMock.mockReturnValue(true);
    isModelAuditSharingEnabledMock.mockReturnValue(true);

    (spawn as unknown as Mock).mockReturnValue(createMockScanProcess());

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync(['node', 'scan-model', 'model.pkl']);

    expect(createShareableModelAuditUrlMock).toHaveBeenCalled();
  });

  it('should not share by default when cloud is not enabled', async () => {
    cloudConfigIsEnabledMock.mockReturnValue(false);
    isModelAuditSharingEnabledMock.mockReturnValue(false);

    (spawn as unknown as Mock).mockReturnValue(createMockScanProcess());

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync(['node', 'scan-model', 'model.pkl']);

    expect(createShareableModelAuditUrlMock).not.toHaveBeenCalled();
  });

  it('should not share when user wants to share but sharing is not enabled', async () => {
    cloudConfigIsEnabledMock.mockReturnValue(false);
    isModelAuditSharingEnabledMock.mockReturnValue(false); // No cloud, no custom URL

    (spawn as unknown as Mock).mockReturnValue(createMockScanProcess());

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync(['node', 'scan-model', 'model.pkl', '--share']);

    // Even with --share, can't share if not enabled
    expect(createShareableModelAuditUrlMock).not.toHaveBeenCalled();
  });

  it('should register both --share and --no-share options', () => {
    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    const options = command?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--share');
    expect(optionNames).toContain('--no-share');
  });

  describe('Scanner selection options', () => {
    it('should pass --include-scanner option to modelaudit', async () => {
      const mockChildProcess = {
        killed: false,
        kill: vi.fn(),
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
        'model.pkl',
        '--include-scanner',
        'PickleScanner',
        '--include-scanner',
        'H5Scanner',
        '--no-write',
      ]);

      expect(spawn).toHaveBeenCalledWith(
        'modelaudit',
        expect.arrayContaining([
          'scan',
          'model.pkl',
          '--include-scanner',
          'PickleScanner',
          '--include-scanner',
          'H5Scanner',
        ]),
        expect.any(Object),
      );
    });

    it('should pass --exclude-scanner option to modelaudit', async () => {
      const mockChildProcess = {
        killed: false,
        kill: vi.fn(),
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
        'model.pkl',
        '--exclude-scanner',
        'WeightDistributionScanner',
        '--no-write',
      ]);

      expect(spawn).toHaveBeenCalledWith(
        'modelaudit',
        expect.arrayContaining([
          'scan',
          'model.pkl',
          '--exclude-scanner',
          'WeightDistributionScanner',
        ]),
        expect.any(Object),
      );
    });

    it('should pass --profile option to modelaudit', async () => {
      const mockChildProcess = {
        killed: false,
        kill: vi.fn(),
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
        'model.pkl',
        '--profile',
        'quick-scan',
        '--no-write',
      ]);

      expect(spawn).toHaveBeenCalledWith(
        'modelaudit',
        expect.arrayContaining(['scan', 'model.pkl', '--profile', 'quick-scan']),
        expect.any(Object),
      );
    });

    it('should register scanner selection options', () => {
      modelScanCommand(program);
      const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
      const options = command?.options || [];
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--include-scanner');
      expect(optionNames).toContain('--exclude-scanner');
      expect(optionNames).toContain('--profile');
    });

    it('should save scanner selection options to audit metadata', async () => {
      const ModelAudit = (await import('../../src/models/modelAudit')).default;
      const createSpy = vi.mocked(ModelAudit.create);

      (spawn as unknown as Mock).mockReturnValue(createMockScanProcess());

      modelScanCommand(program);
      const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
      await command.parseAsync([
        'node',
        'scan-model',
        'model.pkl',
        '--include-scanner',
        'PickleScanner',
        '--profile',
        'quick-scan',
      ]);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            options: expect.objectContaining({
              includeScanner: ['PickleScanner'],
              profile: 'quick-scan',
            }),
          }),
        }),
      );
    });
  });
});

