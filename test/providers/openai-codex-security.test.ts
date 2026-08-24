import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type { ChildProcess } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { importModule, resolvePackageEntryPoint } from '../../src/esm';
import { OpenAICodexSDKProvider } from '../../src/providers/openai/codex-sdk';
import {
  CODEX_SECURITY_OPERATIONS,
  OpenAICodexSecurityProvider,
} from '../../src/providers/openai/codex-security';
import { providerRegistry } from '../../src/providers/providerRegistry';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: vi.fn(),
}));

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  importModule: vi.fn(),
  resolvePackageEntryPoint: vi.fn(),
}));

const mockRun = vi.fn();
const mockValidate = vi.fn();
const mockClose = vi.fn();
const mockRefs = vi.fn();
const mockWorkingTree = vi.fn();
const MockCodexSecurity = vi.fn();

const mockModule = {
  CodexSecurity: MockCodexSecurity,
  DiffTarget: {
    refs: mockRefs,
    workingTree: mockWorkingTree,
  },
  VERSION: '0.1.18',
  BUNDLED_PLUGIN_VERSION: '0.1.22',
};

function createScanResult(overrides: Record<string, unknown> = {}) {
  const findings = {
    findings: [{ findingId: 'finding-1', title: 'SQL injection', severity: { level: 'high' } }],
  };
  const result = {
    manifest: { scanId: 'scan-123' },
    findings,
    coverage: { filesTotal: 8, filesReviewed: 8 },
    scanDir: '/tmp/security-scan',
    threadId: 'thread-123',
    turnResult: {
      model: 'gpt-5.6-sol',
      durationMs: 1500,
      usage: {
        input_tokens: 100,
        cached_input_tokens: 25,
        cache_write_input_tokens: 10,
        output_tokens: 40,
        reasoning_output_tokens: 12,
      },
    },
    cost: {
      model: 'gpt-5.6-sol',
      inputTokens: 100,
      cachedInputTokens: 25,
      cacheWriteInputTokens: 10,
      outputTokens: 40,
      estimatedUsd: 0.012,
    },
    sarifPath: '/tmp/security-scan/findings.sarif',
    reportPath: '/tmp/security-scan/report.md',
    manifestPath: '/tmp/security-scan/manifest.json',
    findingsPath: '/tmp/security-scan/findings.json',
    coveragePath: '/tmp/security-scan/coverage.json',
    artifactsDir: '/tmp/security-scan/artifacts',
    pluginVersion: '0.1.22',
    ...overrides,
  };

  return {
    ...result,
    toJSON: () => ({ manifest: result.manifest, findings: result.findings }),
  };
}

function mockCli(stdout: string, error: NodeJS.ErrnoException | null = null): ChildProcess {
  const child = { kill: vi.fn() } as unknown as ChildProcess;
  vi.mocked(execFile).mockImplementation(((
    _file: string,
    _args: string[],
    _options: unknown,
    callback: Function,
  ) => {
    queueMicrotask(() => callback(error, stdout, ''));
    return child;
  }) as typeof execFile);
  return child;
}

describe('OpenAICodexSecurityProvider', () => {
  let originalBasePath: string | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    originalBasePath = cliState.basePath;
    cliState.basePath = undefined;
    vi.mocked(resolvePackageEntryPoint).mockReset();
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(
      '/packages/@openai/codex-security/dist/index.js',
    );
    vi.mocked(importModule).mockReset();
    vi.mocked(importModule).mockResolvedValue(mockModule);
    mockRun.mockReset();
    mockRun.mockResolvedValue(createScanResult());
    mockValidate.mockReset();
    mockValidate.mockResolvedValue({
      disposition: 'reportable',
      report: 'The finding is reachable and exploitable.',
      outputDir: '/tmp/security-validation',
      threadId: 'validation-thread',
    });
    mockClose.mockReset();
    mockClose.mockResolvedValue(undefined);
    mockRefs.mockReset();
    mockRefs.mockImplementation((options) => ({ kind: 'refs', ...options }));
    mockWorkingTree.mockReset();
    mockWorkingTree.mockImplementation((options = {}) => ({ kind: 'working_tree', ...options }));
    MockCodexSecurity.mockImplementation(function () {
      return {
        run: mockRun,
        validate: mockValidate,
        close: mockClose,
      };
    });
    vi.mocked(execFile).mockReset();
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    cliState.basePath = originalBasePath;
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('defaults to the Codex Security provider ID and repository scan operation', async () => {
      const provider = new OpenAICodexSecurityProvider();

      expect(provider.id()).toBe('openai:codex-security');
      expect(provider.requiresApiKey()).toBe(false);
      expect(provider.toString()).toBe('[OpenAI Codex Security Provider]');
      expect((await provider.callApi('Audit this repository')).metadata?.operation).toBe(
        'security-scan',
      );
    });

    it('includes every operation bundled with the Codex Security SDK', () => {
      expect(CODEX_SECURITY_OPERATIONS).toHaveLength(14);
      expect(CODEX_SECURITY_OPERATIONS).toEqual(
        expect.arrayContaining([
          'security-scan',
          'deep-security-scan',
          'security-diff-scan',
          'validation',
          'fix-finding',
          'verify-fix',
          'threat-model',
          'track-findings',
        ]),
      );
    });

    it('accepts a custom provider ID and SDK settings', () => {
      const provider = new OpenAICodexSecurityProvider({
        id: 'standard-gpt-5.6-sol',
        config: { model: 'gpt-5.6-sol', operation: 'security-scan', max_cost_usd: 2 },
      });

      expect(provider.id()).toBe('standard-gpt-5.6-sol');
      expect(provider.config.model).toBe('gpt-5.6-sol');
    });

    it('accepts retry settings injected by provider connectivity tests and the scheduler', () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'security-scan', maxRetries: 1 },
      });

      expect(provider.config.maxRetries).toBe(1);
    });

    it('rejects unsupported operations and unknown configuration fields', () => {
      expect(
        () => new OpenAICodexSecurityProvider({ config: { operation: 'scan' } as never }),
      ).toThrow('Invalid OpenAI Codex Security provider configuration');
      expect(
        () => new OpenAICodexSecurityProvider({ config: { apiKey: 'secret' } as never }),
      ).toThrow('Unrecognized key');
    });

    it('rejects conflicting reasoning settings and incompatible diff targets', () => {
      expect(
        () =>
          new OpenAICodexSecurityProvider({
            config: { model_reasoning_effort: 'high', reasoning_effort: 'low' },
          }),
      ).toThrow('reasoning_effort and model_reasoning_effort must match');
      expect(
        () =>
          new OpenAICodexSecurityProvider({
            config: { working_tree: true, head_ref: 'feature' },
          }),
      ).toThrow('head_ref cannot be combined with working_tree');
      expect(
        () =>
          new OpenAICodexSecurityProvider({
            config: { paths: ['src'], base_ref: 'main' },
          }),
      ).toThrow('paths cannot be combined with a diff target');
    });

    it('returns actionable errors when the optional SDK is unavailable', async () => {
      vi.mocked(resolvePackageEntryPoint).mockReturnValue(null);
      const provider = new OpenAICodexSecurityProvider();

      expect(await provider.callApi('Scan')).toEqual({
        error: expect.stringContaining('npm install @openai/codex-security'),
      });
    });

    it('explains SDK import and runtime failures', async () => {
      vi.mocked(importModule).mockRejectedValue(new Error('unsupported Node version'));
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toContain('Failed to load @openai/codex-security');
      expect(response.error).toContain('even-numbered Node.js');
    });

    it('ignores an outdated config-directory SDK and loads a compatible Promptfoo installation', async () => {
      cliState.basePath = '/evaluation/config';
      vi.mocked(resolvePackageEntryPoint).mockImplementation((_packageName, basePath) =>
        basePath === '/evaluation/config'
          ? '/legacy/@openai/codex-security/dist/index.js'
          : '/promptfoo/@openai/codex-security/dist/index.js',
      );
      vi.mocked(importModule).mockImplementation(async (entryPoint) =>
        String(entryPoint).startsWith('/legacy/')
          ? { ...mockModule, VERSION: '0.1.8' }
          : mockModule,
      );
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.metadata?.sdkVersion).toBe('0.1.18');
      expect(importModule).toHaveBeenCalledWith('/legacy/@openai/codex-security/dist/index.js');
      expect(importModule).toHaveBeenCalledWith('/promptfoo/@openai/codex-security/dist/index.js');
    });

    it('rejects outdated security SDKs that omit validation and deep-worker usage', async () => {
      vi.mocked(importModule).mockResolvedValue({ ...mockModule, VERSION: '0.1.8' });
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toContain('package is incompatible (0.1.8)');
      expect(response.error).toContain('npm install @openai/codex-security@^0.1.18');
      expect(mockRun).not.toHaveBeenCalled();
    });
  });

  describe('repository scanning', () => {
    it('normalizes findings, usage, reasoning tokens, estimated cost, and artifacts', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: {
          operation: 'security-scan',
          repository: '/repos/service',
          model: 'gpt-5.6-sol',
          model_reasoning_effort: 'high',
          max_cost_usd: 4,
        },
      });

      const response = await provider.callApi('Find remotely exploitable vulnerabilities');

      expect(MockCodexSecurity).toHaveBeenCalledWith({
        codexOverrides: { model: 'gpt-5.6-sol', model_reasoning_effort: 'high' },
      });
      expect(mockRun).toHaveBeenCalledWith(
        '/repos/service',
        expect.objectContaining({
          mode: 'standard',
          target: 'repository',
          scanPrompt: 'Find remotely exploitable vulnerabilities',
          maxCostUsd: 4,
        }),
      );
      expect(response).toMatchObject({
        cached: false,
        format: 'json',
        cost: 0.012,
        latencyMs: 1500,
        sessionId: 'thread-123',
        tokenUsage: {
          prompt: 100,
          completion: 40,
          cached: 25,
          total: 140,
          completionDetails: {
            reasoning: 12,
            cacheReadInputTokens: 25,
            cacheCreationInputTokens: 10,
          },
        },
        metadata: {
          operation: 'security-scan',
          mode: 'standard',
          model: 'gpt-5.6-sol',
          reasoningEffort: 'high',
          findingsCount: 1,
          pluginVersion: '0.1.22',
          sdkVersion: '0.1.18',
          skillCalls: [{ name: 'security-scan' }],
        },
      });
      expect(JSON.parse(response.output)).toHaveProperty('findings.findings');
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('forwards deep-scan worker and stopping controls only for deep scans', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: {
          operation: 'deep-security-scan',
          paths: ['src/api', 'src/auth'],
          workers: 3,
          subagents: 2,
          stop_after_no_new: 1,
          max_discovery_runs: 6,
          max_time_hours: 0.5,
        },
      });

      const response = await provider.callApi('Prioritize authorization bypasses');

      expect(mockRun).toHaveBeenCalledWith(
        process.cwd(),
        expect.objectContaining({
          mode: 'deep',
          target: ['src/api', 'src/auth'],
          workers: 3,
          subagents: 2,
          stopAfterNoNew: 1,
          maxDiscoveryRuns: 6,
          maxTimeHours: 0.5,
        }),
      );
      expect(response.metadata).toMatchObject({ operation: 'deep-security-scan', mode: 'deep' });
    });

    it('allows explicitly disabling deep-scan subagents', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'deep-security-scan', subagents: 0 },
      });

      await provider.callApi('Run independent discovery without subagents');

      expect(mockRun).toHaveBeenCalledWith(
        process.cwd(),
        expect.objectContaining({ mode: 'deep', subagents: 0 }),
      );
    });

    it('resolves repository, output, plugin, and knowledge-base paths from the config directory', async () => {
      cliState.basePath = '/workspace/evals';
      const provider = new OpenAICodexSecurityProvider({
        config: {
          repository: '../fixtures/service',
          plugin_path: './plugins/security',
          python_path: './python',
          output_dir: './outputs/scan',
          knowledge_base_paths: ['./knowledge.md'],
          archive_existing: true,
          scan_prompt: 'Security policy: protect payment data.',
          validation_prompt: 'Reject speculative issues.',
          post_scan_prompt: 'Summarize remaining risk.',
          expected_plugin_version: '0.1.22',
          failure_severity: 'high',
          auth: 'api-key',
        },
      });

      await provider.callApi('Check checkout handlers');

      expect(MockCodexSecurity).toHaveBeenCalledWith({
        pluginPath: '/workspace/evals/plugins/security',
        pythonPath: '/workspace/evals/python',
      });
      expect(mockRun).toHaveBeenCalledWith(
        '/workspace/fixtures/service',
        expect.objectContaining({
          auth: 'api-key',
          outputDir: '/workspace/evals/outputs/scan',
          knowledgeBasePaths: ['/workspace/evals/knowledge.md'],
          archiveExisting: true,
          scanPrompt: 'Security policy: protect payment data.\n\nCheck checkout handlers',
          validationPrompt: 'Reject speculative issues.',
          postScanPrompt: 'Summarize remaining risk.',
          expectedPluginVersion: '0.1.22',
          failureSeverity: 'high',
        }),
      );
    });

    it('captures observed cost, progress, and warnings when the result has no cost', async () => {
      const observedCost = {
        model: 'gpt-5.6-terra',
        inputTokens: 90,
        cachedInputTokens: 20,
        cacheWriteInputTokens: 5,
        outputTokens: 30,
        estimatedUsd: 0.004,
      };
      mockRun.mockImplementation(async (_repository, options) => {
        options.onCost(observedCost);
        options.onProgress({ phase: 'validation', completed: 4 });
        options.onWarning('One generated proof of concept was skipped.');
        return createScanResult({ cost: null, turnResult: {} });
      });
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.cost).toBe(0.004);
      expect(response.tokenUsage).toMatchObject({ prompt: 90, completion: 30, total: 120 });
      expect(response.metadata).toMatchObject({
        progress: { phase: 'validation', completed: 4 },
        warnings: ['One generated proof of concept was skipped.'],
      });
    });

    it('does not fabricate usage or cost when the SDK omits both', async () => {
      mockRun.mockResolvedValue(createScanResult({ cost: null, turnResult: {} }));
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.tokenUsage).toBeUndefined();
      expect(response.cost).toBeUndefined();
    });

    it('renders provider configuration variables for each eval row', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { repository: '/repos/{{service}}', model: '{{model}}' },
      });
      const context = {
        prompt: { raw: 'scan' },
        vars: { service: 'payments', model: 'gpt-5.6-terra' },
      } as unknown as CallApiContextParams;

      await provider.callApi('Scan payment endpoints', context);

      expect(mockRun).toHaveBeenCalledWith('/repos/payments', expect.any(Object));
      expect(MockCodexSecurity).toHaveBeenCalledWith({
        codexOverrides: { model: 'gpt-5.6-terra' },
      });
    });

    it('passes cancellation signals to the SDK and skips already-aborted calls', async () => {
      const provider = new OpenAICodexSecurityProvider();
      const controller = new AbortController();

      await provider.callApi('Scan', undefined, { abortSignal: controller.signal });

      expect(mockRun).toHaveBeenCalledWith(
        process.cwd(),
        expect.objectContaining({ signal: controller.signal }),
      );

      controller.abort();
      const response = await provider.callApi('Scan', undefined, {
        abortSignal: controller.signal,
      });
      expect(response.error).toContain('aborted before it started');
      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it('closes SDK clients when scans fail', async () => {
      mockRun.mockRejectedValue(new Error('Trusted Access is required'));
      const provider = new OpenAICodexSecurityProvider();

      expect(await provider.callApi('Scan')).toEqual({
        error: 'Codex Security operation failed: Trusted Access is required',
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('diff scanning', () => {
    it('constructs a committed Git ref target', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: {
          operation: 'security-diff-scan',
          base_ref: 'origin/main',
          head_ref: 'feature/auth',
        },
      });

      await provider.callApi('Review only introduced vulnerabilities');

      expect(mockRefs).toHaveBeenCalledWith({ base: 'origin/main', head: 'feature/auth' });
      expect(mockRun).toHaveBeenCalledWith(
        process.cwd(),
        expect.objectContaining({
          mode: 'standard',
          target: { kind: 'refs', base: 'origin/main', head: 'feature/auth' },
        }),
      );
    });

    it('constructs a working-tree target with an optional base ref', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'security-diff-scan', working_tree: true, base_ref: 'HEAD~1' },
      });

      await provider.callApi('Review uncommitted changes');

      expect(mockWorkingTree).toHaveBeenCalledWith({ base: 'HEAD~1' });
    });

    it('rejects missing diff targets and diff options on repository scans', async () => {
      const diffProvider = new OpenAICodexSecurityProvider({
        config: { operation: 'security-diff-scan' },
      });
      const repositoryProvider = new OpenAICodexSecurityProvider({
        config: { operation: 'security-scan', base_ref: 'main' },
      });

      expect((await diffProvider.callApi('Scan')).error).toContain('requires base_ref');
      expect((await repositoryProvider.callApi('Scan')).error).toContain(
        'require operation: security-diff-scan',
      );
      expect(mockRun).not.toHaveBeenCalled();
    });
  });

  describe('finding validation', () => {
    it('validates structured finding input and returns the SDK disposition', async () => {
      const finding = { title: 'SQL injection', file: 'src/query.ts' };
      const provider = new OpenAICodexSecurityProvider({
        config: {
          operation: 'validation',
          repository: '/repos/service',
          finding,
          output_dir: '/tmp/validation',
          auth: 'chatgpt',
        },
      });

      const response = await provider.callApi('Ignored because finding is configured');

      expect(mockValidate).toHaveBeenCalledWith({
        repositoryPath: '/repos/service',
        finding,
        outputDir: '/tmp/validation',
        auth: 'chatgpt',
      });
      expect(response).toMatchObject({
        format: 'json',
        sessionId: 'validation-thread',
        metadata: { operation: 'validation', disposition: 'reportable' },
      });
      expect(JSON.parse(response.output)).toMatchObject({ disposition: 'reportable' });
      expect(response.cost).toBeUndefined();
    });

    it('loads and parses explicit finding files before invoking the SDK', async () => {
      cliState.basePath = '/workspace/evals';
      const readFile = vi
        .spyOn(fs, 'readFile')
        .mockResolvedValue('{"title":"Authorization bypass"}');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'validation', finding_file: './finding.json' },
      });

      await provider.callApi('Validate');

      expect(readFile).toHaveBeenCalledWith('/workspace/evals/finding.json', 'utf8');
      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({ finding: { title: 'Authorization bypass' } }),
      );
    });

    it('uses structured finding objects supplied as eval-row variables', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'validation' },
      });
      const context = {
        prompt: { raw: 'Validate the finding' },
        vars: { finding: { title: 'Path traversal', file: 'src/download.ts' } },
      } as unknown as CallApiContextParams;

      await provider.callApi('Validate this row', context);

      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({
          finding: { title: 'Path traversal', file: 'src/download.ts' },
        }),
      );
    });

    it('passes non-JSON finding files through as literal text', async () => {
      vi.spyOn(fs, 'readFile').mockResolvedValue('Unchecked redirect in /login');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'validation', finding_file: '/tmp/finding.md' },
      });

      await provider.callApi('Validate');

      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({ finding: 'Unchecked redirect in /login' }),
      );
    });
  });

  describe('remediation CLI', () => {
    it('requires explicit permission before patching repository files', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'fix-finding' },
      });

      const response = await provider.callApi('Fix SQL injection');

      expect(response.error).toContain('allow_file_writes: true');
      expect(execFile).not.toHaveBeenCalled();
    });

    it('patches saved findings through the bundled CLI and returns structured results', async () => {
      mockCli('{"scanId":"scan-42","patches":[{"status":"fixed"}]}');
      const provider = new OpenAICodexSecurityProvider({
        config: {
          operation: 'fix-finding',
          repository: '/repos/isolated-checkout',
          allow_file_writes: true,
          scan_id: 'scan-42',
          severity: 'high',
          model: 'gpt-5.6-sol',
          reasoning_effort: 'high',
          cli_env: { SECURITY_EVAL: true },
        },
      });

      const response = await provider.callApi('Patch findings');

      expect(execFile).toHaveBeenCalledWith(
        process.execPath,
        [
          '/packages/@openai/codex-security/bin/codex-security.mjs',
          'patch',
          '--codex',
          'model="gpt-5.6-sol"',
          '--effort',
          'high',
          '--scan',
          'scan-42',
          '--severity',
          'high',
          '--format',
          'json',
        ],
        expect.objectContaining({
          cwd: '/repos/isolated-checkout',
          env: expect.objectContaining({ SECURITY_EVAL: 'true' }),
        }),
        expect.any(Function),
      );
      expect(JSON.parse(response.output)).toEqual({
        scanId: 'scan-42',
        patches: [{ status: 'fixed' }],
      });
      expect(response.metadata?.operation).toBe('fix-finding');
    });

    it('does not request unsupported JSON output when patching literal finding text', async () => {
      mockCli('Updated src/query.ts and verified the regression test.');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'fix-finding', allow_file_writes: true },
      });

      const response = await provider.callApi('SQL injection in src/query.ts');

      expect(vi.mocked(execFile).mock.calls[0][1]).not.toContain('--format');
      expect(response.output).toBe('Updated src/query.ts and verified the regression test.');
    });

    it('preserves structured verification failures returned with a nonzero exit status', async () => {
      mockCli('{"results":[{"status":"still_vulnerable"}]}', {
        name: 'Error',
        message: 'sensitive finding text should not leak',
        code: 1,
      } as unknown as NodeJS.ErrnoException);
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'verify-fix', finding_id: 'finding-42' },
      });

      const response = await provider.callApi('Verify the fix');

      expect(JSON.parse(response.output)).toEqual({
        results: [{ status: 'still_vulnerable' }],
      });
      expect(response.metadata).toMatchObject({ operation: 'verify-fix', exitCode: 1 });
      expect(response.error).toBeUndefined();
    });

    it('returns sanitized CLI failures without exposing arguments or stderr', async () => {
      mockCli('', {
        name: 'Error',
        message: 'Command failed: finding contains secret-token',
        code: 2,
      } as unknown as NodeJS.ErrnoException);
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'verify-fix' },
      });

      expect(await provider.callApi('secret-token')).toEqual({
        error: 'Codex Security verify-fix failed (exit code 2).',
      });
    });

    it('rejects model-provider overrides unsupported by patch and verify-fix commands', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'verify-fix', model_provider: 'amazon-bedrock' },
      });

      expect((await provider.callApi('Verify')).error).toContain('does not support');
      expect(execFile).not.toHaveBeenCalled();
    });

    it('rejects CLI reasoning and severity settings unsupported by the actual bundled commands', async () => {
      const ultraProvider = new OpenAICodexSecurityProvider({
        config: { operation: 'verify-fix', reasoning_effort: 'ultra' },
      });
      const severityProvider = new OpenAICodexSecurityProvider({
        config: { operation: 'verify-fix', severity: 'high' },
      });

      expect((await ultraProvider.callApi('Verify')).error).toContain('does not support ultra');
      expect((await severityProvider.callApi('Verify')).error).toContain(
        'severity filtering requires scan_id or finding_id',
      );
      expect(execFile).not.toHaveBeenCalled();
    });

    it('forwards explicit finding files to remediation commands', async () => {
      cliState.basePath = '/workspace/evals';
      mockCli('{"results":[{"status":"fixed"}]}');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'verify-fix', finding_file: './findings/issue.md' },
      });

      await provider.callApi('Verify');

      expect(vi.mocked(execFile).mock.calls[0][1]).toEqual(
        expect.arrayContaining(['/workspace/evals/findings/issue.md', '--format', 'json']),
      );
    });
  });

  describe('standalone plugin skills', () => {
    it('invokes installed security skills through the Codex SDK with a read-only sandbox', async () => {
      cliState.basePath = '/workspace/evals';
      const callApi = vi
        .spyOn(OpenAICodexSDKProvider.prototype, 'callApi')
        .mockResolvedValue({ output: 'Threat model', metadata: { toolCalls: 3 } });
      const provider = new OpenAICodexSecurityProvider({
        config: {
          operation: 'threat-model',
          repository: '../repo',
          codex_home: './codex-home',
          model: 'gpt-5.6-terra',
          reasoning_effort: 'medium',
        },
      });

      const response = await provider.callApi('Map trust boundaries');

      expect(callApi).toHaveBeenCalledWith(
        'Use $codex-security:threat-model to complete this task.\n\nMap trust boundaries',
        undefined,
        undefined,
      );
      const delegatedProvider = callApi.mock.instances[0] as OpenAICodexSDKProvider;
      expect(delegatedProvider.config).toMatchObject({
        model: 'gpt-5.6-terra',
        model_reasoning_effort: 'medium',
        working_dir: '/workspace/repo',
        sandbox_mode: 'read-only',
        approval_policy: 'never',
        cli_env: { CODEX_HOME: '/workspace/evals/codex-home' },
      });
      expect(response.metadata).toMatchObject({
        toolCalls: 3,
        operation: 'threat-model',
        repository: '/workspace/repo',
      });
    });

    it('requires write opt-in before updating repository security policy', async () => {
      const callApi = vi.spyOn(OpenAICodexSDKProvider.prototype, 'callApi');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'define-security-policy' },
      });

      expect((await provider.callApi('Create SECURITY.md')).error).toContain(
        'allow_file_writes: true',
      );
      expect(callApi).not.toHaveBeenCalled();
    });

    it('requires explicit approval before creating external issues', async () => {
      const callApi = vi.spyOn(OpenAICodexSDKProvider.prototype, 'callApi');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'track-findings' },
      });

      expect((await provider.callApi('Create Linear issues')).error).toContain(
        'allow_external_writes: true',
      );
      expect(callApi).not.toHaveBeenCalled();
    });

    it('preserves eval context without leaking security-only config into the delegated provider', async () => {
      const callApi = vi
        .spyOn(OpenAICodexSDKProvider.prototype, 'callApi')
        .mockResolvedValue({ output: 'Finding triaged' });
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'triage-finding' },
      });
      const context = {
        prompt: { raw: 'triage', config: { operation: 'triage-finding' } },
        vars: { finding: 'CVE-example' },
        evaluationId: 'eval-123',
      } as unknown as CallApiContextParams;

      await provider.callApi('Triage CVE-example', context);

      expect(callApi).toHaveBeenCalledWith(
        expect.stringContaining('$codex-security:triage-finding'),
        expect.objectContaining({
          evaluationId: 'eval-123',
          prompt: expect.objectContaining({ config: undefined }),
        }),
        undefined,
      );
    });
  });

  describe('lifecycle', () => {
    it('does not close completed SDK clients again during provider shutdown', async () => {
      const provider = new OpenAICodexSecurityProvider();
      await provider.callApi('Scan');

      await provider.shutdown();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('resolves the bundled CLI relative to the optional package entry point', async () => {
      mockCli('{"results":[]}');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'verify-fix', finding_id: 'finding-42' },
      });

      await provider.callApi('Verify');

      expect(vi.mocked(execFile).mock.calls[0][1]?.[0]).toBe(
        path.join('/packages/@openai/codex-security', 'bin/codex-security.mjs'),
      );
    });
  });
});
