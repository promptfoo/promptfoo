import { type ChildProcess, spawn } from 'child_process';
import { writeFileSync } from 'fs';
import fs from 'fs/promises';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, Mock, MockInstance, vi } from 'vitest';
import {
  checkModelAuditInstalled as checkModelAuditInstalledFromModelScan,
  modelScanCommand,
} from '../../src/commands/modelScan';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import ModelAudit from '../../src/models/modelAudit';
import { createShareableModelAuditUrl, isModelAuditSharingEnabled } from '../../src/share';
import { getModelAuditCurrentVersion } from '../../src/updates';
import {
  getHuggingFaceMetadata,
  isHuggingFaceModel,
  parseHuggingFaceModel,
} from '../../src/util/huggingfaceMetadata';
import { checkModelAuditInstalled } from '../../src/util/modelAuditInstall';
import { asMockChildProcess, createMockChildProcess } from '../util/mockChildProcess';
import { mockProcessEnv } from '../util/utils';

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
vi.mock('../../src/globalConfig/accounts', () => ({
  getAuthor: vi.fn().mockReturnValue(null),
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

const SIGNAL_TERMINATIONS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGKILL'];
const VALID_SCAN_OUTPUT = JSON.stringify({
  total_checks: 10,
  passed_checks: 10,
  failed_checks: 0,
  has_errors: false,
  files_scanned: 1,
  bytes_scanned: 1024,
  duration: 1000,
  issues: [],
  checks: [],
});

function mockProcessExit() {
  return vi.spyOn(process, 'exit').mockImplementation(function () {
    return undefined as never;
  });
}

function createPassThroughProcess(exitCode: number): ChildProcess {
  return asMockChildProcess(createMockChildProcess({ exitCode }));
}

function createClosedProcess(signal: NodeJS.Signals | null, stdout = ''): ChildProcess {
  const mockChildProcess = {
    stdout: {
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'data' && stdout) {
          callback(Buffer.from(stdout));
        }
        return mockChildProcess.stdout;
      }),
    },
    stderr: {
      on: vi.fn().mockImplementation(function () {
        return mockChildProcess.stderr;
      }),
    },
    killed: false,
    kill: vi.fn(),
    on: vi.fn().mockImplementation(function (event: string, callback: any) {
      if (event === 'close') {
        callback(null, signal);
      }
      return mockChildProcess;
    }),
  } as unknown as ChildProcess;

  return mockChildProcess;
}

async function resetModelScanTestMocks() {
  vi.clearAllMocks();

  vi.mocked(spawn).mockReset();
  vi.mocked(getModelAuditCurrentVersion).mockReset();
  vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.16');

  vi.mocked(ModelAudit.findByRevision).mockReset();
  vi.mocked(ModelAudit.findByRevision).mockResolvedValue(null);
  vi.mocked(ModelAudit.create).mockReset();
  vi.mocked(ModelAudit.create).mockResolvedValue({ id: 'scan-abc-2025-01-01T00:00:00' } as any);

  vi.mocked(isHuggingFaceModel).mockReset();
  vi.mocked(isHuggingFaceModel).mockReturnValue(false);
  vi.mocked(getHuggingFaceMetadata).mockReset();
  vi.mocked(getHuggingFaceMetadata).mockResolvedValue(null);
  vi.mocked(parseHuggingFaceModel).mockReset();
  vi.mocked(parseHuggingFaceModel).mockReturnValue(null);
}

describe('modelScanCommand', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(async () => {
    program = new Command();
    mockExit = mockProcessExit();
    process.exitCode = 0;
    await resetModelScanTestMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
    process.exitCode = 0;
  });

  it('should exit if no paths are provided', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Still need spawn mock since Commander may try to execute the command action

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    command?.configureOutput({
      writeErr: vi.fn(),
      writeOut: vi.fn(),
    });
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

    loggerErrorSpy.mockRestore();
  });

  it('should exit if modelaudit is not installed', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // Mock getModelAuditCurrentVersion to return null (not installed)
    (getModelAuditCurrentVersion as Mock).mockResolvedValueOnce(null);

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model']);

    expect(loggerErrorSpy).toHaveBeenCalledWith('ModelAudit is not installed.');
    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(1);
    expect(spawn).not.toHaveBeenCalled();

    loggerErrorSpy.mockRestore();
  });

  it('should spawn modelaudit process with correct arguments (--no-write mode)', async () => {
    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Using --no-write to test pass-through mode without temp file handling

    (spawn as unknown as Mock).mockReturnValue(createPassThroughProcess(0));

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

  it('should pass scanner selection options to modelaudit', async () => {
    (spawn as unknown as Mock).mockReturnValue(createPassThroughProcess(0));

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync([
      'node',
      'scan-model',
      'model.pkl',
      '--scanners',
      'pickle,tf_savedmodel',
      '--scanners',
      'PickleScanner',
      '--exclude-scanner',
      'weight_distribution',
      '--no-write',
    ]);

    expect(spawn).toHaveBeenCalledWith(
      'modelaudit',
      [
        'scan',
        'model.pkl',
        '--format',
        'text',
        '--timeout',
        '300',
        '--scanners',
        'pickle,tf_savedmodel',
        '--scanners',
        'PickleScanner',
        '--exclude-scanner',
        'weight_distribution',
      ],
      expect.objectContaining({
        stdio: 'inherit',
      }),
    );
  });

  it('should keep no-write JSON passthrough output free of promptfoo logs', async () => {
    (spawn as unknown as Mock).mockReturnValue(createPassThroughProcess(0));

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync([
      'node',
      'scan-model',
      'model.pkl',
      '--scanners',
      'pickle',
      '--format',
      'json',
      '--no-write',
    ]);

    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Running model scan on:'));
  });

  it('should list modelaudit scanners without requiring paths', async () => {
    (spawn as unknown as Mock).mockReturnValue(createPassThroughProcess(0));

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    await command.parseAsync(['node', 'scan-model', '--list-scanners', '--format', 'json']);

    expect(spawn).toHaveBeenCalledWith(
      'modelaudit',
      ['scan', '--format', 'json', '--list-scanners'],
      expect.objectContaining({
        stdio: 'inherit',
      }),
    );
    expect(process.exitCode).toBe(0);
  });

  it('should handle modelaudit process error', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)

    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ error: new Error('spawn error') })),
    );

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

    loggerErrorSpy.mockRestore();
  });

  it('should handle exit code 1 (scan completed with issues) in --no-write mode', async () => {
    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Using --no-write to test pass-through mode

    // Exit code 1 means issues found but scan completed.
    vi.mocked(spawn).mockReturnValue(asMockChildProcess(createMockChildProcess({ exitCode: 1 })));

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model', '--no-write']);

    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(1);
  });

  it('should handle exit code 2 (scan process error) in --no-write mode', async () => {
    // Mock logger.error to capture the output
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // getModelAuditCurrentVersion is already mocked to return '0.2.16' (installed)
    // Using --no-write to test pass-through mode

    (spawn as unknown as Mock).mockReturnValue(createPassThroughProcess(2));

    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'path/to/model', '--no-write']);

    expect(loggerErrorSpy).toHaveBeenCalledWith('Model scan process exited with code 2');
    // Now uses process.exitCode instead of process.exit()
    expect(process.exitCode).toBe(2);

    loggerErrorSpy.mockRestore();
  });
});

describe('Signal termination handling', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(async () => {
    program = new Command();
    mockExit = mockProcessExit();
    process.exitCode = 0;
    await resetModelScanTestMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
    process.exitCode = 0;
    vi.resetAllMocks();
  });

  it.each(SIGNAL_TERMINATIONS)(
    'fails closed in --no-write mode when modelaudit terminates via %s',
    async (signal) => {
      (spawn as unknown as Mock).mockReturnValue(createClosedProcess(signal));

      modelScanCommand(program);
      const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

      await command.parseAsync(['node', 'scan-model', 'model.pkl', '--no-write']);

      expect(logger.error).toHaveBeenCalledWith(
        `Model scan process terminated by signal ${signal}`,
      );
      expect(process.exitCode).toBe(1);
    },
  );

  it('forwards parent SIGINT to modelaudit as SIGINT', async () => {
    let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
    const mockChildProcess = {
      killed: false,
      kill: vi.fn(),
      on: vi.fn().mockImplementation(function (event: string, callback: any) {
        if (event === 'close') {
          closeHandler = callback;
        }
        return mockChildProcess;
      }),
    } as unknown as ChildProcess;
    (spawn as unknown as Mock).mockReturnValue(mockChildProcess);

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    const parsePromise = command.parseAsync(['node', 'scan-model', 'model.pkl', '--no-write']);

    await vi.waitFor(() => {
      expect(closeHandler).toBeDefined();
    });
    process.emit('SIGINT');
    closeHandler?.(null, 'SIGINT');
    await parsePromise;

    expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGINT');
    expect(logger.error).toHaveBeenCalledWith('Model scan process terminated by signal SIGINT');
    expect(process.exitCode).toBe(1);
  });

  it('fails closed when modelaudit closes without an exit code or signal', async () => {
    (spawn as unknown as Mock).mockReturnValue(createClosedProcess(null));

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync(['node', 'scan-model', 'model.pkl', '--no-write']);

    expect(logger.error).toHaveBeenCalledWith('Model scan process exited without an exit code');
    expect(process.exitCode).toBe(1);
  });

  it('fails closed in stdout-capture mode after JSON output when modelaudit closes without an exit code or signal', async () => {
    (spawn as unknown as Mock).mockReturnValue(createClosedProcess(null, VALID_SCAN_OUTPUT));

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync(['node', 'scan-model', 'model.pkl']);

    expect(logger.error).toHaveBeenCalledWith('Model scan process exited without an exit code');
    expect(process.exitCode).toBe(1);
    expect(ModelAudit.create).not.toHaveBeenCalled();
  });

  it.each(SIGNAL_TERMINATIONS)(
    'fails closed in stdout-capture mode after JSON output when modelaudit terminates via %s',
    async (signal) => {
      (spawn as unknown as Mock).mockReturnValue(createClosedProcess(signal, VALID_SCAN_OUTPUT));

      modelScanCommand(program);
      const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

      await command.parseAsync(['node', 'scan-model', 'model.pkl']);

      expect(logger.error).toHaveBeenCalledWith(
        `Model scan process terminated by signal ${signal}`,
      );
      expect(process.exitCode).toBe(1);
      expect(ModelAudit.create).not.toHaveBeenCalled();
    },
  );

  it.each(SIGNAL_TERMINATIONS)(
    'fails closed in temp-output mode after JSON output when modelaudit terminates via %s',
    async (signal) => {
      vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.20');
      (spawn as unknown as Mock).mockImplementation((_command: string, args: string[]) => {
        const outputFlagIndex = args.indexOf('--output');
        writeFileSync(args[outputFlagIndex + 1], VALID_SCAN_OUTPUT);
        return createClosedProcess(signal);
      });

      modelScanCommand(program);
      const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

      await command.parseAsync(['node', 'scan-model', 'model.pkl']);

      expect(logger.error).toHaveBeenCalledWith(
        `Model scan process terminated by signal ${signal}`,
      );
      expect(process.exitCode).toBe(1);
      expect(ModelAudit.create).not.toHaveBeenCalled();
    },
  );

  it('fails closed in temp-output mode after JSON output when modelaudit closes without an exit code or signal', async () => {
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.20');
    (spawn as unknown as Mock).mockImplementation((_command: string, args: string[]) => {
      const outputFlagIndex = args.indexOf('--output');
      writeFileSync(args[outputFlagIndex + 1], VALID_SCAN_OUTPUT);
      return createClosedProcess(null);
    });

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync(['node', 'scan-model', 'model.pkl']);

    expect(logger.error).toHaveBeenCalledWith('Model scan process exited without an exit code');
    expect(process.exitCode).toBe(1);
    expect(ModelAudit.create).not.toHaveBeenCalled();
  });
});

describe('Result verdict handling', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(async () => {
    program = new Command();
    mockExit = mockProcessExit();
    process.exitCode = 0;
    await resetModelScanTestMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
    process.exitCode = 0;
  });

  it('returns exit code 1 when stdout JSON contains findings even if modelaudit exits 0', async () => {
    const findingsOutput = JSON.stringify({
      ...JSON.parse(VALID_SCAN_OUTPUT),
      has_errors: false,
      failed_checks: 1,
      issues: [{ severity: 'critical', message: 'synthetic critical finding' }],
    });
    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: findingsOutput })),
    );

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync(['node', 'scan-model', 'model.pkl']);

    expect(process.exitCode).toBe(1);
    expect(ModelAudit.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ results: JSON.parse(findingsOutput) }),
    );
  });

  it('returns exit code 1 when temp-file JSON contains findings even if modelaudit exits 0', async () => {
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.20');
    const findingsOutput = JSON.stringify({
      ...JSON.parse(VALID_SCAN_OUTPUT),
      has_errors: false,
      failed_checks: 1,
      issues: [{ severity: 'critical', message: 'synthetic critical finding' }],
    });
    (spawn as unknown as Mock).mockImplementation((_command: string, args: string[]) => {
      const outputFlagIndex = args.indexOf('--output');
      writeFileSync(args[outputFlagIndex + 1], findingsOutput);
      return asMockChildProcess(createMockChildProcess());
    });

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;

    await command.parseAsync(['node', 'scan-model', 'model.pkl']);

    expect(process.exitCode).toBe(1);
    expect(ModelAudit.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ results: JSON.parse(findingsOutput) }),
    );
  });

  it.each([
    ['not valid json {{{', 'Failed to parse scan results:'],
    ['   \n\t', 'No output received from model scan'],
  ])('rejects invalid temp-file scan output %j', async (contents, message) => {
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.20');
    vi.mocked(spawn).mockImplementation((_command, args) => {
      const outputPath = (args as string[])[(args as string[]).indexOf('--output') + 1];
      writeFileSync(outputPath, contents);
      return asMockChildProcess(createMockChildProcess());
    });
    modelScanCommand(program);
    await program.commands[0].parseAsync(['node', 'scan-model', 'model.pkl']);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(process.exitCode).toBe(1);
    // Keep the async boundary before asserting invalid output never reaches persistence.
    const ModelAudit = (await import('../../src/models/modelAudit')).default;
    expect(ModelAudit.create).not.toHaveBeenCalled();
  });

  it('logs failed asynchronous temp cleanup at debug level and retains successful results', async () => {
    vi.mocked(getModelAuditCurrentVersion).mockResolvedValue('0.2.20');
    vi.mocked(spawn).mockImplementation((_command, args) => {
      const outputPath = (args as string[])[(args as string[]).indexOf('--output') + 1];
      writeFileSync(outputPath, VALID_SCAN_OUTPUT);
      return asMockChildProcess(createMockChildProcess());
    });
    const cleanup = vi.spyOn(fs, 'rm').mockRejectedValueOnce(new Error('EPERM: fixture cleanup'));
    try {
      modelScanCommand(program);
      await program.commands[0].parseAsync(['node', 'scan-model', 'model.pkl']);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup temp file'),
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
      expect(ModelAudit.create).toHaveBeenCalledTimes(1);
    } finally {
      cleanup.mockRestore();
    }
  });
});

describe('Re-scan on version change behavior', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(async () => {
    program = new Command();
    mockExit = mockProcessExit();
    await resetModelScanTestMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it.each([
    [
      ['--scanners', 'pickle', '--force'],
      ['pickle'],
      '0.2.10',
      'Re-scanning with scanner selection options',
    ],
    [
      ['--force'],
      ['pickle'],
      '0.2.10',
      'Re-scanning because cached revision used scanner selection options',
    ],
    [['--force'], [], '0.2.10', 'Re-scanning (--force): test-owner/test-model'],
    [[], [], '0.2.10', 'Re-scanning: modelaudit upgraded from 0.2.10 to 0.2.16'],
    [[], [], null, 'Re-scanning: previous scan missing version info (now using 0.2.16)'],
    [[], [], '0.2.16', 'Re-scanning mutable HuggingFace alias: test-owner/test-model'],
  ] as const)(
    'preserves diagnostic priority for %j with cached scanners %j and version %s',
    async (args, scanners, scannerVersion, diagnostic) => {
      vi.mocked(isHuggingFaceModel).mockReturnValue(true);
      vi.mocked(parseHuggingFaceModel).mockReturnValue({ owner: 'test-owner', repo: 'test-model' });
      vi.mocked(getHuggingFaceMetadata).mockResolvedValue({
        modelId: 'test-owner/test-model',
        sha: 'abc123',
        lastModified: '2026-04-27T00:00:00.000Z',
        author: 'test-owner',
      });
      vi.mocked(ModelAudit.findByRevision).mockResolvedValue({
        scannerVersion,
        metadata: { options: { scanners } },
      } as any);
      vi.mocked(spawn).mockReturnValue(createClosedProcess('SIGTERM'));

      modelScanCommand(program);
      await program.commands[0].parseAsync([
        'node',
        'scan-model',
        'hf://test-owner/test-model',
        ...args,
      ]);

      expect(
        vi.mocked(logger.debug).mock.calls.filter(([message]) => message.startsWith('Re-scanning')),
      ).toEqual([[diagnostic]]);
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
      expect(ModelAudit.create).not.toHaveBeenCalled();
    },
  );

  it('should re-scan a mutable HuggingFace alias even when the same revision was seen before', async () => {
    // Mock HuggingFace model detection
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      modelId: 'test-owner/test-model',
      sha: 'abc123',
      lastModified: '2026-04-27T00:00:00.000Z',
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
    (spawn as unknown as Mock).mockReturnValue(createClosedProcess('SIGTERM'));

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    // Mutable aliases should not be trusted as a cache hit.
    expect(mockExit).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it('should create a new mutable HuggingFace alias scan when no matching revision exists', async () => {
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      modelId: 'test-owner/test-model',
      sha: 'abc123',
      lastModified: '2026-04-27T00:00:00.000Z',
      siblings: [],
    });

    (ModelAudit.findByRevision as Mock).mockResolvedValue(null);

    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: VALID_SCAN_OUTPUT })),
    );

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    expect(ModelAudit.findByRevision).toHaveBeenCalledWith('test-owner/test-model', 'abc123');
    expect(
      vi.mocked(logger.debug).mock.calls.filter(([message]) => message.startsWith('Re-scanning')),
    ).toEqual([]);
    expect(ModelAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'test-owner/test-model',
        modelSource: 'huggingface',
        revisionSha: 'abc123',
      }),
    );
  });

  it('should omit the revision SHA when a HuggingFace alias changes during the scan', async () => {
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock)
      .mockResolvedValueOnce({
        modelId: 'test-owner/test-model',
        sha: 'before-scan',
        lastModified: '2026-04-27T00:00:00.000Z',
        siblings: [],
      })
      .mockResolvedValueOnce({
        modelId: 'test-owner/test-model',
        sha: 'after-scan',
        lastModified: '2026-04-27T00:01:00.000Z',
        siblings: [],
      });
    (ModelAudit.findByRevision as Mock).mockResolvedValue(null);

    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: VALID_SCAN_OUTPUT })),
    );

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    expect(ModelAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'test-owner/test-model',
        modelSource: 'huggingface',
      }),
    );
    expect((ModelAudit.create as Mock).mock.calls[0][0]).not.toHaveProperty('revisionSha');
  });

  it('should create a new mutable HuggingFace alias scan when content changed', async () => {
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      modelId: 'test-owner/test-model',
      sha: 'abc123',
      lastModified: '2026-04-27T00:00:00.000Z',
      siblings: [],
    });

    const existingAudit = {
      id: 'existing-scan-id',
      scannerVersion: '0.2.16',
      contentHash: 'old-content',
      createdAt: Date.now(),
      results: {},
      save: vi.fn().mockResolvedValue(undefined),
    };
    (ModelAudit.findByRevision as Mock).mockResolvedValue(existingAudit);

    const changedScanOutput = JSON.stringify({
      ...JSON.parse(VALID_SCAN_OUTPUT),
      content_hash: 'new-content',
    });
    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: changedScanOutput })),
    );

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    expect(existingAudit.save).not.toHaveBeenCalled();
    expect(ModelAudit.create).toHaveBeenCalledTimes(1);
  });

  it('should reuse an existing mutable HuggingFace alias scan when content hash matches', async () => {
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      modelId: 'test-owner/test-model',
      sha: 'abc123',
      lastModified: '2026-04-27T00:00:00.000Z',
      siblings: [],
    });

    const existingAudit = {
      id: 'existing-content-scan-id',
      scannerVersion: '0.2.16',
      contentHash: 'old-content',
      createdAt: Date.now(),
      results: {},
      save: vi.fn().mockResolvedValue(undefined),
    };
    (ModelAudit.findByRevision as Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingAudit);

    const matchingScanOutput = JSON.stringify({
      ...JSON.parse(VALID_SCAN_OUTPUT),
      content_hash: 'old-content',
    });
    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: matchingScanOutput })),
    );

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    expect(ModelAudit.findByRevision).toHaveBeenNthCalledWith(1, 'test-owner/test-model', 'abc123');
    expect(ModelAudit.findByRevision).toHaveBeenNthCalledWith(
      2,
      'test-owner/test-model',
      'abc123',
      'old-content',
    );
    expect(existingAudit.save).toHaveBeenCalledTimes(1);
    expect(ModelAudit.create).not.toHaveBeenCalled();
  });

  it('should not reuse a revision match when scanner selection is requested', async () => {
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      modelId: 'test-owner/test-model',
      sha: 'abc123',
      lastModified: '2026-04-27T00:00:00.000Z',
      siblings: [],
    });
    const existingAudit = {
      id: 'existing-scan-id',
      scannerVersion: '0.2.16',
      createdAt: Date.now(),
      results: {},
      save: vi.fn().mockResolvedValue(undefined),
    };
    (ModelAudit.findByRevision as Mock).mockResolvedValue(existingAudit);

    const mockScanOutput = VALID_SCAN_OUTPUT;

    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: mockScanOutput })),
    );

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync([
      'node',
      'scan-model',
      'hf://test-owner/test-model',
      '--scanners',
      'pickle',
    ]);

    expect(spawn).toHaveBeenCalledTimes(1);
    const args = (spawn as Mock).mock.calls[0][1] as string[];
    expect(args).toContain('--scanners');
    expect(args).toContain('pickle');
    expect(existingAudit.save).toHaveBeenCalledTimes(1);
    expect(ModelAudit.create).not.toHaveBeenCalled();
  });

  it('should not reuse a revision match when the cached scan used scanner selection', async () => {
    (isHuggingFaceModel as Mock).mockReturnValue(true);
    (parseHuggingFaceModel as Mock).mockReturnValue({
      owner: 'test-owner',
      repo: 'test-model',
    });
    (getHuggingFaceMetadata as Mock).mockResolvedValue({
      modelId: 'test-owner/test-model',
      sha: 'abc123',
      lastModified: '2026-04-27T00:00:00.000Z',
      siblings: [],
    });
    const existingAudit = {
      id: 'filtered-scan-id',
      scannerVersion: '0.2.16',
      createdAt: Date.now(),
      results: {},
      metadata: {
        options: {
          scanners: ['pickle'],
        },
      },
      save: vi.fn().mockResolvedValue(undefined),
    };
    (ModelAudit.findByRevision as Mock).mockResolvedValue(existingAudit);

    const mockScanOutput = VALID_SCAN_OUTPUT;

    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: mockScanOutput })),
    );

    modelScanCommand(program);
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

    expect(spawn).toHaveBeenCalledTimes(1);
    const args = (spawn as Mock).mock.calls[0][1] as string[];
    expect(args).not.toContain('--scanners');
    expect(args).not.toContain('--exclude-scanner');
    expect(existingAudit.save).toHaveBeenCalledTimes(1);
    expect(ModelAudit.create).not.toHaveBeenCalled();
  });

  for (const { name, scannerVersion } of [
    { name: 'should re-scan when scanner version has changed', scannerVersion: '0.2.10' },
    { name: 'should re-scan when previous scan has no version info', scannerVersion: null },
  ]) {
    it(name, async () => {
      // Mock HuggingFace model detection
      (isHuggingFaceModel as Mock).mockReturnValue(true);
      (parseHuggingFaceModel as Mock).mockReturnValue({
        owner: 'test-owner',
        repo: 'test-model',
      });
      (getHuggingFaceMetadata as Mock).mockResolvedValue({
        modelId: 'test-owner/test-model',
        sha: 'abc123',
        lastModified: '2026-04-27T00:00:00.000Z',
        siblings: [],
      });

      // Create a fresh mutable existing audit for each prior-version case.
      const existingAudit = {
        id: 'existing-scan-id',
        scannerVersion,
        createdAt: Date.now(),
        results: {},
        save: vi.fn().mockResolvedValue(undefined),
      };
      (ModelAudit.findByRevision as Mock).mockResolvedValue(existingAudit);

      // Mock getModelAuditCurrentVersion to return NEW version 0.2.16
      (getModelAuditCurrentVersion as Mock).mockResolvedValue('0.2.16');

      // Mock scan process that returns valid JSON
      const mockScanOutput = JSON.stringify({
        ...JSON.parse(VALID_SCAN_OUTPUT),
        files_scanned: 5,
      });

      vi.mocked(spawn).mockReturnValue(
        asMockChildProcess(createMockChildProcess({ stdoutData: mockScanOutput })),
      );

      modelScanCommand(program);
      const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
      await command?.parseAsync(['node', 'scan-model', 'hf://test-owner/test-model']);

      // Should have called spawn once for the actual scan (proves re-scan was triggered)
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(existingAudit.save).toHaveBeenCalledTimes(1);
    });
  }
});

describe('checkModelAuditInstalled', () => {
  it('remains exported from the modelScan command module for compatibility', () => {
    expect(checkModelAuditInstalledFromModelScan).toBe(checkModelAuditInstalled);
  });
});

describe('Command Options Validation', () => {
  let program: Command;
  let mockExit: MockInstance;

  beforeEach(async () => {
    program = new Command();
    mockExit = mockProcessExit();
    await resetModelScanTestMocks();
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
      '--scanners',
      '--exclude-scanner',
      '--list-scanners',
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

  it('should reject obsolete options before the action handler', async () => {
    modelScanCommand(program);

    const command = program.commands.find((cmd) => cmd.name() === 'scan-model')!;
    const actionReached = vi.fn();
    command.hook('preAction', actionReached);
    command.exitOverride();
    command.configureOutput({
      writeErr: vi.fn(),
      writeOut: vi.fn(),
    });

    await expect(
      command.parseAsync(['node', 'scan-model', 'model.pkl', '--max-file-size', '500MB']),
    ).rejects.toMatchObject({
      code: 'commander.unknownOption',
      message: "error: unknown option '--max-file-size'",
    });
    expect(actionReached).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should only pass valid arguments to modelaudit', async () => {
    vi.mocked(spawn).mockReturnValue(createPassThroughProcess(0));

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

    expect(spawn).toHaveBeenCalledTimes(1);
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
    vi.mocked(spawn).mockReturnValue(createPassThroughProcess(0));

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

    expect(spawn).toHaveBeenCalledTimes(1);
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
    mockExit = mockProcessExit();
    await resetModelScanTestMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
    process.exitCode = 0;
  });

  it('should use inherited stdio when --no-write is specified', async () => {
    // Mock inherited stdio process (captureOutput: false)
    (spawn as unknown as Mock).mockReturnValue(createPassThroughProcess(0));

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
    (spawn as unknown as Mock).mockReturnValue(createPassThroughProcess(0));

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

    vi.mocked(spawn).mockReturnValue(asMockChildProcess(createMockChildProcess({ exitCode: 2 })));

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
  const createShareableModelAuditUrlMock = vi.mocked(createShareableModelAuditUrl);
  const isModelAuditSharingEnabledMock = vi.mocked(isModelAuditSharingEnabled);
  const cloudConfigIsEnabledMock = vi.mocked(cloudConfig.isEnabled);

  beforeEach(async () => {
    program = new Command();
    mockExit = mockProcessExit();
    await resetModelScanTestMocks();

    // Reset sharing mocks
    createShareableModelAuditUrlMock.mockReset();
    createShareableModelAuditUrlMock.mockResolvedValue(
      'https://app.promptfoo.dev/model-audit/test-id',
    );
    isModelAuditSharingEnabledMock.mockReset();
    isModelAuditSharingEnabledMock.mockReturnValue(false);

    cloudConfigIsEnabledMock.mockReset();
    cloudConfigIsEnabledMock.mockReturnValue(false);
  });

  afterEach(() => {
    mockExit.mockRestore();
    process.exitCode = 0;
    mockProcessEnv({ PROMPTFOO_DISABLE_SHARING: undefined });
  });

  // Helper to create a mock scan process that returns valid JSON results
  function createMockScanProcess(exitCode = 0) {
    const mockScanOutput = JSON.stringify({
      total_checks: 10,
      passed_checks: 10,
      failed_checks: 0,
      has_errors: false,
      files_scanned: 5,
      bytes_scanned: 1024,
      duration: 1000,
      issues: [],
      checks: [],
    });

    return asMockChildProcess(createMockChildProcess({ exitCode, stdoutData: mockScanOutput }));
  }

  it('should not share when PROMPTFOO_DISABLE_SHARING env var is set', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_SHARING: 'true' });
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

  it('shares the new audit without a revision SHA when cached model content and its alias change during scanning', async () => {
    vi.mocked(isHuggingFaceModel).mockReturnValue(true);
    vi.mocked(parseHuggingFaceModel).mockReturnValue({ owner: 'test-owner', repo: 'test-model' });
    const metadata = {
      modelId: 'test-owner/test-model',
      lastModified: '2026-04-27T00:00:00.000Z',
      author: 'test-owner',
    };
    vi.mocked(getHuggingFaceMetadata)
      .mockResolvedValueOnce({ ...metadata, sha: 'before-scan' })
      .mockResolvedValueOnce({ ...metadata, sha: 'after-scan' });
    const existingAudit = {
      id: 'old-audit',
      scannerVersion: '0.2.16',
      revisionSha: 'before-scan',
      contentHash: 'old-content',
      save: vi.fn(),
    };
    const createdAudit = { id: 'new-audit' };
    vi.mocked(ModelAudit.findByRevision).mockResolvedValue(existingAudit as any);
    vi.mocked(ModelAudit.create).mockResolvedValue(createdAudit as any);
    const results = {
      ...JSON.parse(VALID_SCAN_OUTPUT),
      content_hash: 'new-content',
      issues: [{ severity: 'warning', message: 'fresh scan finding' }],
    };
    vi.mocked(spawn).mockReturnValue(
      asMockChildProcess(createMockChildProcess({ stdoutData: JSON.stringify(results) })),
    );
    isModelAuditSharingEnabledMock.mockReturnValue(true);

    modelScanCommand(program);
    await program.commands[0].parseAsync([
      'node',
      'scan-model',
      'hf://test-owner/test-model',
      '--share',
    ]);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(getHuggingFaceMetadata).toHaveBeenCalledTimes(2);
    expect(ModelAudit.findByRevision).toHaveBeenCalledExactlyOnceWith(
      'test-owner/test-model',
      'before-scan',
    );
    expect(existingAudit.save).not.toHaveBeenCalled();
    expect(existingAudit).toMatchObject({ revisionSha: 'before-scan', contentHash: 'old-content' });
    expect(ModelAudit.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        modelId: 'test-owner/test-model',
        contentHash: 'new-content',
        results,
      }),
    );
    expect(vi.mocked(ModelAudit.create).mock.calls[0][0]).not.toHaveProperty('revisionSha');
    expect(createShareableModelAuditUrlMock).toHaveBeenCalledExactlyOnceWith(createdAudit);
    expect(process.exitCode).toBe(1);
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
});
