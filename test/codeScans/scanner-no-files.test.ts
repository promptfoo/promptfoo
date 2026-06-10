/**
 * Scanner No Files Test
 *
 * Tests that processDiff handles cases where no files are found to scan
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeScanOutputFormat, type FileRecord } from '../../src/types/codeScan';

describe('Scanner - No Files to Scan', () => {
  it('should filter out files with skipReason when determining includedFiles', () => {
    // Simulate the result from processDiff with all files skipped
    const files: FileRecord[] = [
      {
        path: 'package-lock.json',
        status: 'M',
        skipReason: 'denylist',
        shaA: 'abc123',
        shaB: 'def456',
        linesAdded: 10,
        linesRemoved: 5,
      },
      {
        path: 'large-file.bin',
        status: 'M',
        skipReason: 'blob too large',
        shaA: 'abc124',
        shaB: 'def457',
        linesAdded: 100,
        linesRemoved: 50,
      },
    ];

    // This is the same logic used in scanner/index.ts
    const includedFiles = files.filter((f) => !f.skipReason && f.patch);

    expect(includedFiles).toHaveLength(0);
  });

  it('should correctly identify included files when some have no skipReason', () => {
    const files: FileRecord[] = [
      {
        path: 'package-lock.json',
        status: 'M',
        skipReason: 'denylist',
        shaA: 'abc123',
        shaB: 'def456',
        linesAdded: 10,
        linesRemoved: 5,
      },
      {
        path: 'src/index.ts',
        status: 'M',
        shaA: 'abc124',
        shaB: 'def457',
        linesAdded: 5,
        linesRemoved: 2,
        patch: '@@ -1,3 +1,4 @@\n+const test = true;\n const existing = true;',
      },
    ];

    const includedFiles = files.filter((f) => !f.skipReason && f.patch);

    expect(includedFiles).toHaveLength(1);
    expect(includedFiles[0].path).toBe('src/index.ts');
  });

  it('should handle empty file array', () => {
    const files: FileRecord[] = [];

    const includedFiles = files.filter((f) => !f.skipReason && f.patch);

    expect(includedFiles).toHaveLength(0);
  });
});

describe('Scanner machine-readable output', () => {
  function mockScanner({
    initialLogLevel = 'info',
    loadConfigError,
    processDiffError,
  }: {
    initialLogLevel?: string;
    loadConfigError?: Error;
    processDiffError?: Error;
  } = {}) {
    let currentLogLevel = initialLogLevel;

    const disconnect = vi.fn();

    vi.doMock('../../src/codeScan/git/diffProcessor', () => ({
      processDiff: processDiffError
        ? vi.fn().mockRejectedValue(processDiffError)
        : vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('../../src/codeScan/git/diff', () => ({
      validateOnBranch: vi.fn().mockResolvedValue('main'),
    }));
    vi.doMock('../../src/codeScan/config/loader', () => ({
      loadConfigOrDefault: loadConfigError
        ? vi.fn().mockImplementation(() => {
            throw loadConfigError;
          })
        : vi.fn().mockReturnValue({
            minimumSeverity: 'medium',
            diffsOnly: true,
          }),
      mergeConfigWithOptions: vi.fn().mockImplementation((config, options) => ({
        ...config,
        diffsOnly: options.diffsOnly ?? config.diffsOnly,
      })),
      resolveGuidance: vi.fn().mockReturnValue(undefined),
      resolveApiHost: vi.fn().mockReturnValue('https://api.example.com'),
    }));
    vi.doMock('simple-git', () => ({
      default: vi.fn(() => ({
        branch: vi.fn().mockResolvedValue({ current: 'main', all: ['main'] }),
        revparse: vi.fn().mockResolvedValue('abc123'),
      })),
    }));
    vi.doMock('../../src/util/agent/agentClient', () => ({
      createAgentClient: vi.fn().mockResolvedValue({
        sessionId: 'test-session-id',
        start: vi.fn(),
        cancel: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        on: vi.fn(),
        emit: vi.fn(),
        disconnect,
        socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), disconnect: vi.fn() },
      }),
    }));
    vi.doMock('../../src/codeScan/util/auth', () => ({
      resolveAuthCredentials: vi.fn().mockResolvedValue({ apiKey: 'test-key' }),
    }));
    vi.doMock('../../src/cliState', () => ({
      default: { postActionCallback: null },
    }));
    vi.doMock('../../src/logger', () => ({
      default: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
      getLogLevel: vi.fn().mockImplementation(() => currentLogLevel),
      setLogLevel: vi.fn().mockImplementation((level: string) => {
        currentLogLevel = level;
      }),
    }));
    vi.doMock('../../src/codeScan/scanner/cleanup', () => ({
      registerCleanupHandlers: vi.fn(),
    }));
    vi.doMock('../../src/codeScan/scanner/output', () => ({
      createSpinner: vi.fn().mockReturnValue(undefined),
      displayScanResults: vi.fn(),
    }));

    return { disconnect };
  }

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['--json', { json: true, diffsOnly: true }, CodeScanOutputFormat.JSON],
    [
      '--format sarif',
      { format: CodeScanOutputFormat.SARIF, diffsOnly: true },
      CodeScanOutputFormat.SARIF,
    ],
  ])('emits an empty machine-readable response when no files are available with %s', async (_label, options, expectedFormat) => {
    mockScanner();

    const { executeScan } = await import('../../src/codeScan/scanner/index');
    const { displayScanResults } = await import('../../src/codeScan/scanner/output');
    const { getLogLevel, setLogLevel } = await import('../../src/logger');
    const setLogLevelMock = vi.mocked(setLogLevel);

    await executeScan('/test/repo', options);

    expect(displayScanResults).toHaveBeenCalledWith(
      { success: true, comments: [], review: 'No files to scan' },
      expect.any(Number),
      { format: expectedFormat, githubPr: undefined },
    );
    expect(setLogLevelMock).toHaveBeenCalledWith('error');
    expect(setLogLevelMock).toHaveBeenLastCalledWith('info');
    expect(getLogLevel()).toBe('info');
  });

  it('restores the original log level when structured config loading fails early', async () => {
    mockScanner({ loadConfigError: new Error('missing config') });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { executeScan } = await import('../../src/codeScan/scanner/index');
    const logger = (await import('../../src/logger')).default;
    const { getLogLevel, setLogLevel } = await import('../../src/logger');
    const setLogLevelMock = vi.mocked(setLogLevel);

    await executeScan('/test/repo', { json: true, config: '/missing.yaml' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Scan failed: missing config');
    expect(logger.error).not.toHaveBeenCalled();
    expect(setLogLevelMock).toHaveBeenNthCalledWith(1, 'error');
    expect(setLogLevelMock).toHaveBeenLastCalledWith('info');
    expect(getLogLevel()).toBe('info');
  });

  it('keeps invalid structured output flag combinations off stdout', async () => {
    mockScanner();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { executeScan } = await import('../../src/codeScan/scanner/index');
    const logger = (await import('../../src/logger')).default;
    const { getLogLevel, setLogLevel } = await import('../../src/logger');
    const setLogLevelMock = vi.mocked(setLogLevel);

    await executeScan('/test/repo', { json: true, format: CodeScanOutputFormat.SARIF });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Scan failed: Cannot combine --json with --format sarif',
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(setLogLevelMock).not.toHaveBeenCalled();
    expect(getLogLevel()).toBe('info');
  });

  it('keeps structured-output suppression active until cleanup finishes', async () => {
    const { disconnect } = mockScanner({
      initialLogLevel: 'debug',
      processDiffError: new Error('diff failed'),
    });

    const { executeScan } = await import('../../src/codeScan/scanner/index');
    const { getLogLevel, setLogLevel } = await import('../../src/logger');
    const setLogLevelMock = vi.mocked(setLogLevel);

    await executeScan('/test/repo', { json: true });

    expect(disconnect).toHaveBeenCalled();
    expect(setLogLevelMock.mock.calls).toEqual([['error'], ['debug']]);
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      setLogLevelMock.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(getLogLevel()).toBe('debug');
  });
});
