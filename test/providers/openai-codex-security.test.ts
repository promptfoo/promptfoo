import fs from 'fs/promises';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getDirectory, importModule, resolvePackageEntryPoint } from '../../src/esm';
import {
  CODEX_SECURITY_OPERATIONS,
  OpenAICodexSecurityProvider,
} from '../../src/providers/openai/codex-security';
import { providerRegistry } from '../../src/providers/providerRegistry';

import type { CallApiContextParams } from '../../src/types/index';

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

    it('exposes only operations implemented natively by the Codex Security SDK', () => {
      expect(CODEX_SECURITY_OPERATIONS).toEqual([
        'security-scan',
        'deep-security-scan',
        'security-diff-scan',
        'validation',
      ]);
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
      expect(
        () => new OpenAICodexSecurityProvider({ config: { operation: 'fix-finding' } as never }),
      ).toThrow('Invalid OpenAI Codex Security provider configuration');
      expect(
        () => new OpenAICodexSecurityProvider({ config: { operation: 'threat-model' } as never }),
      ).toThrow('Invalid OpenAI Codex Security provider configuration');
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

    it('ignores an outdated trusted SDK and loads a compatible Promptfoo installation', async () => {
      const firstTrustedRoot = path.resolve(getDirectory(), '..');
      vi.mocked(resolvePackageEntryPoint).mockImplementation((_packageName, basePath) =>
        basePath === firstTrustedRoot
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

    it('continues searching trusted install paths when the first SDK cannot be imported', async () => {
      const firstTrustedRoot = path.resolve(getDirectory(), '..');
      vi.mocked(resolvePackageEntryPoint).mockImplementation((_packageName, basePath) =>
        basePath === firstTrustedRoot
          ? '/broken/@openai/codex-security/dist/index.js'
          : '/promptfoo/@openai/codex-security/dist/index.js',
      );
      vi.mocked(importModule).mockImplementation(async (entryPoint) => {
        if (String(entryPoint).startsWith('/broken/')) {
          throw new Error('broken local SDK installation');
        }
        return mockModule;
      });
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.metadata?.sdkVersion).toBe('0.1.18');
      expect(importModule).toHaveBeenCalledWith('/broken/@openai/codex-security/dist/index.js');
      expect(importModule).toHaveBeenCalledWith('/promptfoo/@openai/codex-security/dist/index.js');
    });

    it('never imports SDK packages from an adversarial repository or config directory', async () => {
      cliState.basePath = '/adversarial/repository';
      vi.mocked(resolvePackageEntryPoint).mockImplementation((_packageName, basePath) =>
        basePath === '/adversarial/repository'
          ? '/adversarial/repository/node_modules/@openai/codex-security/dist/index.js'
          : '/promptfoo/node_modules/@openai/codex-security/dist/index.js',
      );
      const provider = new OpenAICodexSecurityProvider({
        config: { basePath: '/adversarial/repository', repository: '.' },
      });

      const response = await provider.callApi('Scan the adversarial checkout');

      expect(response.metadata?.sdkVersion).toBe('0.1.18');
      expect(resolvePackageEntryPoint).not.toHaveBeenCalledWith(
        '@openai/codex-security',
        '/adversarial/repository',
      );
      expect(importModule).toHaveBeenCalledWith(
        '/promptfoo/node_modules/@openai/codex-security/dist/index.js',
      );
      expect(importModule).not.toHaveBeenCalledWith(
        '/adversarial/repository/node_modules/@openai/codex-security/dist/index.js',
      );
    });

    it('rejects provider-scoped credentials that the native SDK cannot consume', async () => {
      const provider = new OpenAICodexSecurityProvider({
        env: { OPENAI_API_KEY: 'provider-scoped-test-key' },
      });

      const response = await provider.callApi('Scan');

      expect(response.error).toContain('does not support provider-scoped OPENAI_API_KEY');
      expect(response.error).toContain('Promptfoo process environment');
      expect(mockRun).not.toHaveBeenCalled();
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
      expect(response.latencyMs).toBeUndefined();
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

    it('uses aggregate scan usage rather than only the final model turn', async () => {
      mockRun.mockResolvedValue(
        createScanResult({
          turnResult: {
            usage: {
              input_tokens: 10,
              output_tokens: 4,
              cached_input_tokens: 2,
              cache_write_input_tokens: 1,
              reasoning_output_tokens: 3,
            },
          },
          cost: {
            inputTokens: 500,
            outputTokens: 200,
            cachedInputTokens: 50,
            cacheWriteInputTokens: 20,
            estimatedUsd: 0.08,
          },
        }),
      );
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'deep-security-scan' },
      });

      const response = await provider.callApi('Run a complete deep scan');

      expect(response.tokenUsage).toEqual({
        prompt: 500,
        completion: 200,
        cached: 50,
        total: 700,
        completionDetails: {
          reasoning: 3,
          cacheReadInputTokens: 50,
          cacheCreationInputTokens: 20,
        },
      });
    });

    it('resolves repository, output, plugin, and knowledge-base paths from the config directory', async () => {
      const configDirectory = path.resolve('/workspace/evals');
      cliState.basePath = configDirectory;
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
        pluginPath: path.resolve(configDirectory, 'plugins/security'),
        pythonPath: path.resolve(configDirectory, 'python'),
      });
      expect(mockRun).toHaveBeenCalledWith(
        path.resolve(configDirectory, '../fixtures/service'),
        expect.objectContaining({
          auth: 'api-key',
          outputDir: path.resolve(configDirectory, 'outputs/scan'),
          knowledgeBasePaths: [path.resolve(configDirectory, 'knowledge.md')],
          archiveExisting: true,
          scanPrompt: 'Security policy: protect payment data.\n\nCheck checkout handlers',
          validationPrompt: 'Reject speculative issues.',
          postScanPrompt: 'Summarize remaining risk.',
          expectedPluginVersion: '0.1.22',
          failureSeverity: 'high',
        }),
      );
    });

    it('prefers an explicit provider base path over global CLI state', async () => {
      const configDirectory = path.resolve('/programmatic/evals');
      cliState.basePath = path.resolve('/unrelated/global-config');
      const provider = new OpenAICodexSecurityProvider({
        config: {
          basePath: configDirectory,
          repository: '../service',
          plugin_path: './plugins/security',
          python_path: './python',
          output_dir: './artifacts/scan',
          knowledge_base_paths: ['./knowledge.md'],
        },
      });

      await provider.callApi('Scan the programmatically configured repository');

      expect(MockCodexSecurity).toHaveBeenCalledWith({
        pluginPath: path.resolve(configDirectory, 'plugins/security'),
        pythonPath: path.resolve(configDirectory, 'python'),
      });
      expect(mockRun).toHaveBeenCalledWith(
        path.resolve(configDirectory, '../service'),
        expect.objectContaining({
          outputDir: path.resolve(configDirectory, 'artifacts/scan'),
          knowledgeBasePaths: [path.resolve(configDirectory, 'knowledge.md')],
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

    it('ignores generic per-test options while applying supported provider overrides', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: {
          repository: '/repos/service',
          model: 'gpt-5.6-terra',
          model_reasoning_effort: 'medium',
        },
      });
      const context = {
        prompt: {
          raw: 'scan',
          config: {
            model_reasoning_effort: 'high',
            transform: 'output => output',
            storeOutputAs: 'securityScan',
            timeout: 30_000,
          },
        },
        vars: {},
      } as unknown as CallApiContextParams;

      const response = await provider.callApi('Scan the service', context);

      expect(response.error).toBeUndefined();
      expect(mockRun).toHaveBeenCalledWith('/repos/service', expect.any(Object));
      expect(MockCodexSecurity).toHaveBeenCalledWith({
        codexOverrides: { model: 'gpt-5.6-terra', model_reasoning_effort: 'high' },
      });
    });

    it('still validates conflicting provider settings after stripping generic test options', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { model_reasoning_effort: 'medium' },
      });
      const context = {
        prompt: {
          raw: 'scan',
          config: { reasoning_effort: 'high', timeout: 30_000 },
        },
        vars: {},
      } as unknown as CallApiContextParams;

      const response = await provider.callApi('Scan the service', context);

      expect(response.error).toContain(
        'reasoning_effort and model_reasoning_effort must match when both are set',
      );
      expect(mockRun).not.toHaveBeenCalled();
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

    it('preserves successful scan results when closing the SDK client fails', async () => {
      mockClose.mockRejectedValue(new Error('cleanup failed'));
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toBeUndefined();
      expect(response.metadata?.operation).toBe('security-scan');
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
      const configDirectory = path.resolve('/workspace/evals');
      cliState.basePath = configDirectory;
      const readFile = vi
        .spyOn(fs, 'readFile')
        .mockResolvedValue('{"title":"Authorization bypass"}');
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'validation', finding_file: './finding.json' },
      });

      await provider.callApi('Validate');

      expect(readFile).toHaveBeenCalledWith(path.resolve(configDirectory, 'finding.json'), 'utf8');
      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({ finding: { title: 'Authorization bypass' } }),
      );
    });

    it('resolves validation paths from an explicit provider base path', async () => {
      const configDirectory = path.resolve('/programmatic/evals');
      cliState.basePath = path.resolve('/unrelated/global-config');
      const readFile = vi.spyOn(fs, 'readFile').mockResolvedValue('{"title":"Auth bypass"}');
      const provider = new OpenAICodexSecurityProvider({
        config: {
          operation: 'validation',
          basePath: configDirectory,
          repository: '../service',
          finding_file: './finding.json',
          output_dir: './artifacts/validation',
        },
      });

      await provider.callApi('Validate the programmatically supplied finding');

      expect(readFile).toHaveBeenCalledWith(path.resolve(configDirectory, 'finding.json'), 'utf8');
      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: path.resolve(configDirectory, '../service'),
          finding: { title: 'Auth bypass' },
          outputDir: path.resolve(configDirectory, 'artifacts/validation'),
        }),
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

    it('preserves validated findings when closing the SDK client fails', async () => {
      mockClose.mockRejectedValue(new Error('cleanup failed'));
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'validation' },
      });

      const response = await provider.callApi('Validate this finding');

      expect(response.error).toBeUndefined();
      expect(response.metadata?.disposition).toBe('reportable');
    });
  });

  describe('lifecycle', () => {
    it('does not close completed SDK clients again during provider shutdown', async () => {
      const provider = new OpenAICodexSecurityProvider();
      await provider.callApi('Scan');

      await provider.shutdown();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
