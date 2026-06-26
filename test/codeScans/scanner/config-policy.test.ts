import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ScannerRequestModule = typeof import('../../../src/codeScan/scanner/request');

describe('scanner config policy boundary', () => {
  let repoPath: string;

  beforeEach(() => {
    vi.resetModules();
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-code-scan-policy-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(repoPath, { force: true, recursive: true });
    process.exitCode = 0;
  });

  function mockScannerBoundaries() {
    const disconnect = vi.fn();

    vi.doMock('../../../src/codeScan/git/diffProcessor', () => ({
      processDiff: vi.fn().mockResolvedValue([
        {
          path: 'src/index.ts',
          status: 'M',
          shaA: 'abc123',
          shaB: 'def456',
          linesAdded: 1,
          linesRemoved: 0,
          patch: '@@ -1 +1,2 @@\n const existing = true;\n+const added = true;',
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
        author: 'Promptfoo test',
        timestamp: '2026-06-26T00:00:00.000Z',
      }),
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
        disconnect,
        socket: { io: { off: vi.fn() } },
      }),
    }));
    vi.doMock('../../../src/codeScan/mcp/index', () => ({
      setupMcpBridge: vi.fn().mockResolvedValue({ mcpBridge: null, mcpProcess: null }),
    }));
    vi.doMock('../../../src/codeScan/mcp/filesystem', () => ({
      stopFilesystemMcpServer: vi.fn(),
    }));
    vi.doMock('../../../src/codeScan/util/auth', () => ({
      resolveAuthCredentials: vi.fn().mockReturnValue({ apiKey: 'test-key' }),
    }));
    vi.doMock('../../../src/cliState', () => ({
      default: { postActionCallback: null, webUI: false },
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
    vi.doMock('../../../src/codeScan/scanner/request', async () => {
      const actual = await vi.importActual<ScannerRequestModule>(
        '../../../src/codeScan/scanner/request',
      );
      return {
        ...actual,
        buildScanRequest: vi.fn(actual.buildScanRequest),
        executeScanRequestWithRetry: vi.fn().mockResolvedValue({
          success: true,
          comments: [],
        }),
      };
    });

    return { disconnect };
  }

  it('ignores an unselected repository config and uses trusted defaults', async () => {
    fs.writeFileSync(
      path.join(repoPath, '.promptfoo-code-scan.yaml'),
      [
        'minimumSeverity: critical',
        'diffsOnly: true',
        'apiHost: https://attacker.invalid',
        'guidanceFile: missing-guidance.md',
      ].join('\n'),
    );
    const { disconnect } = mockScannerBoundaries();

    const { executeScan } = await import('../../../src/codeScan/scanner/index');
    const { setupMcpBridge } = await import('../../../src/codeScan/mcp/index');
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');
    const { buildScanRequest } = await import('../../../src/codeScan/scanner/request');

    await executeScan(repoPath, {
      apiHost: 'https://api.promptfoo.app',
      base: 'main',
      compare: 'HEAD',
      json: true,
    });

    expect(createAgentClient).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'https://api.promptfoo.app' }),
    );
    expect(setupMcpBridge).toHaveBeenCalledWith(
      expect.anything(),
      path.resolve(repoPath),
      'test-session-id',
    );
    expect(buildScanRequest).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({ minimumSeverity: 'medium', diffsOnly: false }),
      'test-session-id',
      undefined,
      undefined,
    );
    expect(disconnect).toHaveBeenCalled();
  });

  it('loads an explicitly selected config, including relative guidance', async () => {
    const guidancePath = path.join(repoPath, 'guidance.md');
    const configPath = path.join(repoPath, 'selected.yaml');
    fs.writeFileSync(guidancePath, 'Review authentication boundaries.');
    fs.writeFileSync(
      configPath,
      [
        'minimumSeverity: critical',
        'diffsOnly: true',
        'apiHost: https://scanner.example',
        'guidanceFile: guidance.md',
      ].join('\n'),
    );
    mockScannerBoundaries();

    const { executeScan } = await import('../../../src/codeScan/scanner/index');
    const { setupMcpBridge } = await import('../../../src/codeScan/mcp/index');
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');
    const { buildScanRequest } = await import('../../../src/codeScan/scanner/request');

    await executeScan(repoPath, {
      base: 'main',
      compare: 'HEAD',
      config: configPath,
      json: true,
    });

    expect(createAgentClient).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'https://scanner.example' }),
    );
    expect(setupMcpBridge).not.toHaveBeenCalled();
    expect(buildScanRequest).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({ minimumSeverity: 'critical', diffsOnly: true }),
      'test-session-id',
      undefined,
      'Review authentication boundaries.',
    );
  });
});
