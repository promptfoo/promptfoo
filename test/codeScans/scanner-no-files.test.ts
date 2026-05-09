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

describe('Scanner JSON Output', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should delegate valid JSON output when no files are available with --json', async () => {
    // Set up mocks before importing executeScan
    vi.doMock('../../src/codeScan/git/diffProcessor', () => ({
      processDiff: vi.fn().mockResolvedValue([]),
    }));

    vi.doMock('../../src/codeScan/git/diff', () => ({
      validateOnBranch: vi.fn().mockResolvedValue('main'),
    }));

    vi.doMock('../../src/codeScan/config/loader', () => ({
      loadConfigOrDefault: vi.fn().mockResolvedValue({
        minimumSeverity: 'medium',
        diffsOnly: true,
      }),
      mergeConfigWithOptions: vi.fn().mockImplementation((config, options) => ({
        ...config,
        diffsOnly: options.diffsOnly ?? config.diffsOnly,
      })),
      resolveGuidance: vi.fn().mockResolvedValue(undefined),
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
        disconnect: vi.fn(),
        socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), disconnect: vi.fn() },
      }),
    }));

    vi.doMock('../../src/codeScan/util/auth', () => ({
      resolveAuthCredentials: vi.fn().mockResolvedValue({ apiKey: 'test-key' }),
    }));

    vi.doMock('../../src/cliState', () => ({
      default: {
        postActionCallback: null,
      },
    }));

    vi.doMock('../../src/logger', () => ({
      default: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
      getLogLevel: vi.fn().mockReturnValue('info'),
    }));

    vi.doMock('../../src/codeScan/scanner/cleanup', () => ({
      registerCleanupHandlers: vi.fn(),
    }));

    vi.doMock('../../src/codeScan/scanner/output', () => ({
      createSpinner: vi.fn().mockReturnValue(undefined),
      displayScanResults: vi.fn(),
    }));

    // Import after mocks are set up
    const { executeScan } = await import('../../src/codeScan/scanner/index');
    const { displayScanResults } = await import('../../src/codeScan/scanner/output');

    await executeScan('/test/repo', { json: true, diffsOnly: true });

    expect(displayScanResults).toHaveBeenCalledWith(
      {
        success: true,
        comments: [],
        review: 'No files to scan',
      },
      expect.any(Number),
      {
        format: CodeScanOutputFormat.JSON,
        githubPr: undefined,
      },
    );
  });
});
