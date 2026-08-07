import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Scanner fork PR auth rejection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  function mockForkPrAuthScanner() {
    vi.doMock('../../../src/codeScan/git/diffProcessor', () => ({
      processDiff: vi.fn().mockResolvedValue([
        {
          path: 'src/index.ts',
          status: 'M',
          shaA: 'abc123',
          shaB: 'def456',
          linesAdded: 5,
          linesRemoved: 2,
          patch: '@@ -1,3 +1,4 @@\n+const test = true;\n const existing = true;',
        },
      ]),
    }));
    vi.doMock('../../../src/codeScan/git/diff', () => ({
      validateOnBranch: vi.fn().mockResolvedValue('main'),
    }));
    vi.doMock('../../../src/codeScan/git/metadata', () => ({
      extractMetadata: vi.fn().mockResolvedValue({
        branch: 'main',
        baseBranch: 'main',
        baseRef: 'main',
        baseSha: 'base123',
        compareRef: 'HEAD',
        compareSha: 'compare123',
        commitMessages: ['test commit'],
        author: 'Minh Vu',
        timestamp: '2026-05-23T00:00:00.000Z',
      }),
    }));
    vi.doMock('../../../src/codeScan/config/loader', () => ({
      loadConfigOrDefault: vi.fn().mockReturnValue({
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
    vi.doMock('../../../src/util/agent/agentClient', () => ({
      createAgentClient: vi.fn().mockResolvedValue({
        sessionId: 'test-session-id',
        disconnect: vi.fn(),
        socket: { io: { off: vi.fn() } },
      }),
    }));
    vi.doMock('../../../src/codeScan/util/auth', () => ({
      resolveAuthCredentials: vi.fn().mockReturnValue({ apiKey: 'test-key' }),
    }));
    vi.doMock('../../../src/cliState', () => ({
      default: { postActionCallback: null },
    }));
    vi.doMock('../../../src/logger', () => ({
      default: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
      getLogLevel: vi.fn().mockReturnValue('info'),
      setLogLevel: vi.fn(),
    }));
    vi.doMock('../../../src/codeScan/scanner/cleanup', () => ({
      registerCleanupHandlers: vi.fn(),
    }));
    vi.doMock('../../../src/codeScan/scanner/output', () => ({
      createSpinner: vi.fn().mockReturnValue(undefined),
      displayScanResults: vi.fn(),
    }));
    vi.doMock('../../../src/codeScan/scanner/request', () => ({
      buildScanRequest: vi.fn().mockReturnValue({ request: 'test' }),
      executeScanRequestWithRetry: vi
        .fn()
        .mockRejectedValue(new Error('Fork PR scanning not authorized')),
    }));
  }

  const SKIP_MESSAGE = 'Fork PR scanning requires maintainer approval. See PR comment for options.';

  it('emits a structured skip response with skipReason in json mode', async () => {
    mockForkPrAuthScanner();

    const { executeScan } = await import('../../../src/codeScan/scanner/index');
    const { displayScanResults } = await import('../../../src/codeScan/scanner/output');
    const { setLogLevel } = await import('../../../src/logger');
    const cliState = (await import('../../../src/cliState')).default;
    const { executeScanRequestWithRetry } = await import('../../../src/codeScan/scanner/request');
    const { processDiff } = await import('../../../src/codeScan/git/diffProcessor');

    await executeScan('/test/repo', {
      format: 'json',
      diffsOnly: true,
      githubPr: 'test-owner/test-repo#123',
    });

    expect(processDiff).toHaveBeenCalled();
    expect(executeScanRequestWithRetry).toHaveBeenCalled();

    expect(displayScanResults).toHaveBeenCalledWith(
      {
        success: true,
        comments: [],
        skipReason: SKIP_MESSAGE,
      },
      expect.any(Number),
      {
        format: 'json',
        githubPr: 'test-owner/test-repo#123',
      },
    );
    expect(setLogLevel).toHaveBeenCalledWith('error');
    expect(typeof cliState.postActionCallback).toBe('function');

    await cliState.postActionCallback?.();

    expect(process.exitCode).toBe(0);
  });

  it('does not emit empty SARIF when fork authorization skips the scan', async () => {
    mockForkPrAuthScanner();
    vi.doUnmock('../../../src/codeScan/scanner/output');

    const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { executeScan } = await import('../../../src/codeScan/scanner/index');
    const cliState = (await import('../../../src/cliState')).default;
    const logger = (await import('../../../src/logger')).default;

    await executeScan('/test/repo', {
      format: 'sarif',
      diffsOnly: true,
      githubPr: 'test-owner/test-repo#123',
    });

    await cliState.postActionCallback?.();

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      `Scan skipped: ${SKIP_MESSAGE} SARIF output was not generated because the scan did not complete.`,
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('emits stdout JSON that the action can round-trip parse', async () => {
    mockForkPrAuthScanner();
    // Use the real output module so we exercise the actual stdout serialization.
    vi.doUnmock('../../../src/codeScan/scanner/output');

    const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { executeScan } = await import('../../../src/codeScan/scanner/index');
    const cliState = (await import('../../../src/cliState')).default;

    await executeScan('/test/repo', {
      json: true,
      diffsOnly: true,
      githubPr: 'test-owner/test-repo#123',
    });

    const stdout = stdoutSpy.mock.calls.map((args) => args.join('')).join('');
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      success: true,
      comments: [],
      skipReason: SKIP_MESSAGE,
    });
    expect(parsed).not.toHaveProperty('commentsPosted');

    await cliState.postActionCallback?.();
    expect(process.exitCode).toBe(0);
  });
});
