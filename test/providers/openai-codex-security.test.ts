import { createHash } from 'crypto';
import { constants } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { satisfies, validRange } from 'semver';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { CodexSecurityResultSchema } from '../../src/contracts/codexSecurity';
import { getDirectory, importModule, resolvePackageEntryPoint } from '../../src/esm';
import {
  CODEX_SECURITY_OPERATIONS,
  OpenAICodexSecurityProvider,
} from '../../src/providers/openai/codex-security';
import { readCodexSecurityReport } from '../../src/providers/openai/codex-security-report';
import { providerRegistry } from '../../src/providers/providerRegistry';
import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../src/util/tokenUsageUtils';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  importModule: vi.fn(),
  resolvePackageEntryPoint: vi.fn(),
}));

const mockRun = vi.fn();
const mockPreflight = vi.fn();
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
const incompatibleSdkVersions = ['0.1.8', '0.1.10'] as const;

function createScanResult(overrides: Record<string, unknown> = {}) {
  const findings = {
    documentType: 'codex-security.findings',
    schemaVersion: '1.0',
    scanId: 'scan-123',
    findings: [{ findingId: 'finding-1', title: 'Recorded finding', severity: { level: 'high' } }],
  };
  const result = {
    manifest: {
      documentType: 'codex-security.scan-manifest',
      schemaVersion: '1.0',
      scan: {
        id: 'scan-123',
        producer: { name: 'codex-security', version: '0.1.22' },
        status: 'completed',
        startedAt: '2026-01-01T12:00:00Z',
        completedAt: '2026-01-01T12:00:05Z',
        target: { kind: 'git_revision', targetId: 'target-123', revision: 'recorded-revision' },
        scope: { includePaths: [], excludePaths: [], limitations: [] },
      },
    },
    findings,
    coverage: {
      documentType: 'codex-security.coverage',
      schemaVersion: '1.0',
      scanId: 'scan-123',
      mode: 'repository',
      completeness: 'complete',
      includePaths: [],
      excludePaths: [],
      surfaces: [],
      explicitExclusions: [],
      deferred: [],
    },
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
    toJSON: () => ({
      manifest: result.manifest,
      findings: result.findings,
      coverage: result.coverage,
      scanDir: result.scanDir,
      threadId: result.threadId,
      reportPath: result.reportPath,
      artifactsDir: result.artifactsDir,
      sarifPath: result.sarifPath,
      cost: result.cost,
      turn: result.turnResult,
    }),
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
    mockPreflight.mockResolvedValue({
      repository: '/repo',
      model: 'test-model',
      reasoningEffort: 'high',
      authentication: { mode: 'chatgpt' },
      outputDir: null,
    });
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
        preflight: mockPreflight,
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

  describe('local setup checks', () => {
    it('checks SDK paths and options without running workloads or inference', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { repository: '/repo', model: 'test-model', max_cost_usd: 1 },
      });
      const result = await provider.checkSetup();
      expect(result).toMatchObject({
        success: true,
        details: {
          check: 'local-preflight',
          repository: '/repo',
          model: 'test-model',
          sdkVersion: '0.1.18',
        },
      });
      expect(result.message).toContain('have not been verified');
      expect(mockPreflight).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ target: 'repository', mode: 'standard', maxCostUsd: 1 }),
      );
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('reports local failures and closes the SDK without starting an operation', async () => {
      mockPreflight.mockRejectedValue(new Error('Repository does not exist'));
      const result = await new OpenAICodexSecurityProvider().checkSetup();
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('Repository does not exist'),
      });
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('does not fall back to an operation when an older SDK lacks preflight', async () => {
      MockCodexSecurity.mockImplementationOnce(function () {
        return { run: mockRun, validate: mockValidate, close: mockClose };
      });
      const result = await new OpenAICodexSecurityProvider().checkSetup();
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('does not support local preflight'),
      });
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('does not invent test-row variables during setup', async () => {
      const result = await new OpenAICodexSecurityProvider({
        config: { repository: '{{repository}}' },
      }).checkSetup();
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('concrete configuration'),
      });
      expect(MockCodexSecurity).not.toHaveBeenCalled();
    });

    it('rejects provider-scoped auth without loading the SDK', async () => {
      const result = await new OpenAICodexSecurityProvider({
        env: { OPENAI_API_KEY: 'dummy-scoped-setup-key' },
      }).checkSetup();
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('process environment'),
      });
      expect(MockCodexSecurity).not.toHaveBeenCalled();
    });

    it('rejects incomplete diff configuration before preflight', async () => {
      const result = await new OpenAICodexSecurityProvider({
        config: { operation: 'security-diff-scan' },
      }).checkSetup();
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('requires base_ref'),
      });
      expect(mockPreflight).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('checks validation finding-file existence without reading or validating the finding', async () => {
      const stat = vi
        .spyOn(fs, 'stat')
        .mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);
      const read = vi.spyOn(fs, 'readFile');
      const result = await new OpenAICodexSecurityProvider({
        config: { operation: 'validation', finding_file: '/repo/finding.json', max_cost_usd: 1 },
      }).checkSetup();
      expect(result.success).toBe(true);
      expect(stat).toHaveBeenCalledWith('/repo/finding.json');
      expect(read).not.toHaveBeenCalled();
      expect(mockPreflight).toHaveBeenCalledWith(process.cwd(), {});
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
    });

    it('rejects a directory used as a finding file', async () => {
      vi.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => false } as Awaited<
        ReturnType<typeof fs.stat>
      >);
      const result = await new OpenAICodexSecurityProvider({
        config: { operation: 'validation', finding_file: '/repo' },
      }).checkSetup();
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('regular file'),
      });
      expect(mockPreflight).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
    });
  });

  describe('result accounting', () => {
    it('retains cost uncertainty without converting unreported cache writes into zero', async () => {
      const cost = {
        model: 'test-model',
        inputTokens: 10,
        outputTokens: 5,
        cachedInputTokens: 0,
        cacheWriteInputTokens: 0,
        cacheWriteInputTokensReported: false,
        estimatedUsd: 0.01,
        estimatedUsdRange: { min: 0.01, max: 0.02, context: 'unknown' },
      };
      mockRun.mockResolvedValue(createScanResult({ cost }));
      const response = await new OpenAICodexSecurityProvider().callApi('Synthetic result');
      expect(response.metadata?.codexSecurity).toMatchObject({
        cost: { baselineUsd: 0.01, range: { minUsd: 0.01, maxUsd: 0.02 } },
        usage: { cacheWriteInput: null },
      });
      expect(response.tokenUsage?.completionDetails).not.toHaveProperty('cacheCreationInputTokens');
    });

    it('omits unreported cache writes when falling back to raw usage without pricing', async () => {
      mockRun.mockResolvedValue(
        createScanResult({
          cost: undefined,
          turnResult: {
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_write_input_tokens: 0,
              cache_write_input_tokens_reported: false,
            },
          },
        }),
      );
      const response = await new OpenAICodexSecurityProvider().callApi('Synthetic result');
      expect(response.cost).toBeUndefined();
      expect(response.tokenUsage).toMatchObject({ prompt: 10, completion: 5 });
      expect(response.tokenUsage?.completionDetails).toBeUndefined();
    });

    it('retains warnings, output directory and cost after SDK failure', async () => {
      const cost = {
        model: 'test-model',
        inputTokens: 10,
        outputTokens: 5,
        estimatedUsd: 0.01,
        estimatedUsdRange: { min: 0.01, max: 0.02, context: 'unknown' },
      };
      mockRun.mockImplementation(async (_repository, options) => {
        options.onOutputDirReady('/tmp/incomplete-output');
        options.onWarning('Incomplete coverage');
        options.onProgress({ phase: 'discovery' });
        options.onCost(cost);
        throw new Error('Interrupted');
      });
      const response = await new OpenAICodexSecurityProvider().callApi('Synthetic result');
      expect(response.metadata).toMatchObject({
        codexSecurity: {
          source: { kind: 'sdk' },
          status: 'failed',
          versions: { sdk: '0.1.18' },
          cost: { baselineUsd: 0.01, range: { minUsd: 0.01, maxUsd: 0.02 } },
          artifacts: [{ kind: 'scanDir', path: '/tmp/incomplete-output' }],
          warnings: ['Incomplete coverage'],
        },
        progress: { phase: 'discovery' },
      });
      expect(response.error).toContain('Interrupted');
    });

    it('identifies validation results with SDK provenance', async () => {
      const response = await new OpenAICodexSecurityProvider({
        config: { operation: 'validation' },
      }).callApi('Synthetic finding');
      expect(response.metadata).toMatchObject({
        codexSecurity: {
          source: { kind: 'sdk' },
          versions: { sdk: '0.1.18' },
          operation: 'validation',
        },
      });
      expect(response.cost).toBeUndefined();
      expect(response.tokenUsage).toBeUndefined();
    });
  });

  describe('saved report files', () => {
    let reportDirectory: string;

    beforeEach(async () => {
      reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-security-report-'));
      // A saved report must work even when neither the SDK nor scoped auth is available.
      vi.mocked(resolvePackageEntryPoint).mockReturnValue(null);
    });

    afterEach(async () => {
      await fs.rm(reportDirectory, { recursive: true, force: true });
    });

    async function saveReport(data: unknown, filename = 'report.json') {
      const file = path.join(reportDirectory, filename);
      const contents = JSON.stringify(data);
      await fs.writeFile(file, contents);
      return { file, contents };
    }

    function mockReportHandle() {
      const handle = {
        stat: vi.fn().mockResolvedValue({ size: 0, isFile: () => true }),
        read: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(fs, 'open').mockResolvedValue(
        handle as unknown as Awaited<ReturnType<typeof fs.open>>,
      );
      return handle;
    }

    it('loads original evidence and provenance without new inference or scan accounting', async () => {
      const raw = createScanResult().toJSON();
      const { file, contents } = await saveReport(raw);
      const provider = new OpenAICodexSecurityProvider({
        config: { report_file: file },
        env: { OPENAI_API_KEY: 'unused-scoped-key' },
      });

      const response = await provider.callApi('Compare existing evidence');

      expect(response.error).toBeUndefined();
      expect(JSON.parse(response.output)).toEqual(raw);
      expect(response.raw).toEqual(raw);
      expect(response).toMatchObject({ format: 'json', incurredCost: 0 });
      expect(response.cost).toBeUndefined();
      expect(response.tokenUsage).toBeUndefined();
      expect(response.latencyMs).toBeUndefined();
      expect(response.metadata?.codexSecurity).toMatchObject({
        source: {
          kind: 'saved-report',
          file,
          sha256: createHash('sha256').update(contents).digest('hex'),
          mocked: false,
        },
        scanId: 'scan-123',
        status: 'completed',
        versions: { sdk: null, plugin: '0.1.22' },
        findings: { total: 1, bySeverity: { high: 1 } },
        coverage: { completeness: 'complete' },
        cost: { baselineUsd: 0.012 },
        usage: { input: 100, output: 40, total: 140 },
        elapsedMs: 5000,
        target: { revision: 'recorded-revision' },
      });
      expect(CodexSecurityResultSchema.safeParse(response.metadata?.codexSecurity).success).toBe(
        true,
      );
      expect(resolvePackageEntryPoint).not.toHaveBeenCalled();
      expect(importModule).not.toHaveBeenCalled();
      expect(MockCodexSecurity).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
      expect(mockPreflight).not.toHaveBeenCalled();
    });

    it('resolves relative files against the explicit provider base path', async () => {
      const { file } = await saveReport(createScanResult().toJSON());
      cliState.basePath = path.join(reportDirectory, 'unrelated');
      const response = await new OpenAICodexSecurityProvider({
        config: { basePath: reportDirectory, report_file: './report.json' },
      }).callApi('Compare');

      expect(response.error).toBeUndefined();
      expect(response.metadata?.codexSecurity?.source.file).toBe(file);
    });

    it('resolves relative files against the configuration directory and renders row variables', async () => {
      const { file } = await saveReport(createScanResult().toJSON());
      cliState.basePath = reportDirectory;
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: '{{reportName}}' },
      }).callApi('Compare', {
        prompt: { raw: 'Compare', label: 'Compare' },
        vars: { reportName: 'report.json' },
      });

      expect(response.error).toBeUndefined();
      expect(response.metadata?.codexSecurity?.source.file).toBe(file);
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('checks a saved report without loading the SDK or checking authentication', async () => {
      const { file } = await saveReport(createScanResult().toJSON());
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file },
        env: { OPENAI_API_KEY: 'unused-scoped-key' },
      }).checkSetup();

      expect(response.success).toBe(true);
      expect(importModule).not.toHaveBeenCalled();
      expect(mockPreflight).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
    });

    it('preserves unknown historical metrics instead of inferring them from provider configuration', async () => {
      const raw = createScanResult({ cost: null, turnResult: {} }).toJSON();
      const { startedAt: _start, completedAt: _end, ...scan } = raw.manifest.scan;
      const { file } = await saveReport({ ...raw, manifest: { ...raw.manifest, scan } });
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file, model: 'configured-but-unobserved' },
      }).callApi('Compare');

      expect(response.error).toBeUndefined();
      expect(response.metadata?.codexSecurity).toMatchObject({
        model: null,
        versions: { sdk: null },
        cost: null,
        usage: null,
        elapsedMs: null,
      });
      expect(response.cost).toBeUndefined();
      expect(response.tokenUsage).toBeUndefined();
      expect(response.latencyMs).toBeUndefined();
    });

    it('retains a recorded failed scan and partial coverage as historical evidence', async () => {
      const raw = createScanResult().toJSON();
      const { file } = await saveReport({
        ...raw,
        manifest: { ...raw.manifest, scan: { ...raw.manifest.scan, status: 'failed' } },
        coverage: { ...raw.coverage, completeness: 'partial' },
      });
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file },
      }).callApi('Compare');

      // Loading completed successfully; the recorded scan outcome remains visible independently.
      expect(response.error).toBeUndefined();
      expect(response.metadata?.codexSecurity).toMatchObject({
        status: 'failed',
        coverage: { completeness: 'partial' },
      });
    });

    it('keeps the operation unknown for scoped deep evidence while preserving its coverage mode', async () => {
      const raw = createScanResult().toJSON();
      const { file } = await saveReport({
        ...raw,
        coverage: { ...raw.coverage, mode: 'scoped_path' },
        findings: {
          ...raw.findings,
          findings: [
            {
              ...raw.findings.findings[0],
              extensions: { candidateId: 'recorded-deep-candidate' },
            },
          ],
        },
      });
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file, operation: 'security-scan' },
      }).callApi('Compare');

      expect(response.error).toBeUndefined();
      expect(response.metadata?.codexSecurity).toMatchObject({
        operation: null,
        coverage: { mode: 'scoped_path' },
        findings: { total: 1 },
      });
    });

    it('loads a saved validation result without assigning unreported usage or SDK versions', async () => {
      const raw = {
        disposition: 'deferred',
        report: 'The recorded review needs more evidence.',
        outputDir: '/original-host/validation',
        threadId: 'recorded-thread',
      };
      const { file } = await saveReport(raw);
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file },
      }).callApi('Compare');

      expect(response.error).toBeUndefined();
      expect(JSON.parse(response.output)).toEqual(raw);
      expect(response.metadata?.codexSecurity).toMatchObject({
        source: { kind: 'saved-report' },
        operation: 'validation',
        validation: { disposition: 'deferred' },
        cost: null,
        usage: null,
        elapsedMs: null,
        versions: { sdk: null, plugin: null },
      });
      expect(mockValidate).not.toHaveBeenCalled();
    });

    it.each([
      ['non-object JSON', () => []],
      ['unrecognized JSON', () => ({ unrelated: true })],
      [
        'wrong document type',
        () => {
          const raw = createScanResult().toJSON();
          return { ...raw, manifest: { ...raw.manifest, documentType: 'other' } };
        },
      ],
      [
        'unsupported schema version',
        () => {
          const raw = createScanResult().toJSON();
          return { ...raw, coverage: { ...raw.coverage, schemaVersion: '2.0' } };
        },
      ],
      [
        'mismatched scan identity',
        () => {
          const raw = createScanResult().toJSON();
          return { ...raw, findings: { ...raw.findings, scanId: 'different-scan' } };
        },
      ],
      [
        'missing findings array',
        () => {
          const raw = createScanResult().toJSON();
          return { ...raw, findings: { ...raw.findings, findings: null } };
        },
      ],
      ['validation without a report', () => ({ disposition: 'deferred' })],
      [
        'explicitly mocked evidence',
        () => {
          const raw = createScanResult().toJSON();
          return { ...raw, turn: { ...raw.turn, mock: true } };
        },
      ],
    ])('rejects %s without falling back to a native operation', async (_name, makeReport) => {
      const { file } = await saveReport(makeReport());
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file },
      }).callApi('Compare');

      expect(response.error).toBeTruthy();
      expect(response.output).toBeUndefined();
      expect(response.metadata?.codexSecurity).toMatchObject({
        source: { kind: 'saved-report', file },
        status: 'failed',
      });
      expect(importModule).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockValidate).not.toHaveBeenCalled();
    });

    it('reports invalid JSON without falling back to an SDK call', async () => {
      const file = path.join(reportDirectory, 'broken.json');
      await fs.writeFile(file, '{broken');
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file },
      }).callApi('Compare');

      expect(response.error).toBeTruthy();
      expect(response.metadata?.codexSecurity?.source.kind).toBe('saved-report');
      expect(mockRun).not.toHaveBeenCalled();
      expect(importModule).not.toHaveBeenCalled();
    });

    it.each(['mock', 'synthetic', 'extensions', 'runtimeStatus'])(
      'rejects the explicit %s marker on otherwise valid saved evidence',
      async (marker) => {
        const raw = createScanResult().toJSON();
        const scan = raw.manifest.scan;
        const marked =
          marker === 'extensions'
            ? {
                ...raw,
                manifest: { ...raw.manifest, scan: { ...scan, extensions: { mock: true } } },
              }
            : marker === 'runtimeStatus'
              ? {
                  ...raw,
                  manifest: {
                    ...raw.manifest,
                    scan: { ...scan, scope: { ...scan.scope, runtimeStatus: 'mock' } },
                  },
                }
              : { ...raw, [marker]: true };
        const { file } = await saveReport(marked);
        const response = await new OpenAICodexSecurityProvider({
          config: { report_file: file },
        }).callApi('Compare');

        expect(response.error).toContain('mock');
        expect(response.output).toBeUndefined();
        expect(mockRun).not.toHaveBeenCalled();
        expect(importModule).not.toHaveBeenCalled();
      },
    );

    it('reports missing files and directory paths without any operation', async () => {
      for (const file of [path.join(reportDirectory, 'missing.json'), reportDirectory]) {
        const response = await new OpenAICodexSecurityProvider({
          config: { report_file: file },
        }).callApi('Compare');
        expect(response.error).toBeTruthy();
        expect(response.metadata?.codexSecurity).toMatchObject({
          source: { kind: 'saved-report', file },
          status: 'failed',
        });
      }
      expect(mockRun).not.toHaveBeenCalled();
      expect(importModule).not.toHaveBeenCalled();
    });

    it('reads multiple bounded chunks from the same regular-file handle and closes it', async () => {
      const raw = { disposition: 'deferred', report: 'Recorded review. '.repeat(5000) };
      const { file, contents } = await saveReport(raw);
      const handle = await fs.open(file, 'r');
      const open = vi.spyOn(fs, 'open').mockResolvedValue(handle);
      const stat = vi.spyOn(handle, 'stat');
      const read = vi.spyOn(handle, 'read');
      const close = vi.spyOn(handle, 'close');
      const pathStat = vi.spyOn(fs, 'stat');
      const readFile = vi.spyOn(fs, 'readFile');

      const result = await readCodexSecurityReport(file);

      expect(result.raw).toEqual(raw);
      expect(result.summary.source.sha256).toBe(
        createHash('sha256').update(contents).digest('hex'),
      );
      expect(open).toHaveBeenCalledExactlyOnceWith(file, constants.O_RDONLY | constants.O_NONBLOCK);
      expect(stat).toHaveBeenCalledOnce();
      expect(read.mock.calls.length).toBeGreaterThan(2);
      expect(close).toHaveBeenCalledOnce();
      expect(pathStat).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('rejects an oversized sparse file before reading contents and closes its handle', async () => {
      const file = path.join(reportDirectory, 'oversized.json');
      const handle = await fs.open(file, 'w+');
      // Extending a sparse file exercises the size check without allocating report contents.
      await handle.truncate(64 * 1024 * 1024 + 1);
      vi.spyOn(fs, 'open').mockResolvedValue(handle);
      const read = vi.spyOn(handle, 'read');
      const close = vi.spyOn(handle, 'close');

      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file },
      }).callApi('Compare');

      expect(response.error).toContain('64 MiB maximum');
      expect(read).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
      expect(importModule).not.toHaveBeenCalled();
    });

    it('enforces the byte cap if a file grows after the handle size check', async () => {
      const handle = mockReportHandle();
      handle.read.mockImplementation(async (buffer: Buffer, _offset: number, length: number) => ({
        buffer,
        bytesRead: length,
      }));

      await expect(readCodexSecurityReport('growing.json')).rejects.toThrow('64 MiB maximum');

      expect(handle.read).toHaveBeenCalledTimes(1025);
      expect(handle.read).toHaveBeenLastCalledWith(expect.any(Buffer), 0, 1, null);
      expect(handle.close).toHaveBeenCalledOnce();
    });

    it('rejects a non-regular opened file without reading and closes the handle', async () => {
      const handle = mockReportHandle();
      handle.stat.mockResolvedValue({ size: 0, isFile: () => false });

      await expect(readCodexSecurityReport('nonregular.json')).rejects.toThrow('regular JSON file');

      expect(handle.read).not.toHaveBeenCalled();
      expect(handle.close).toHaveBeenCalledOnce();
    });

    it.each(['stat', 'read'] as const)('closes the opened handle when %s fails', async (method) => {
      const handle = mockReportHandle();
      handle[method].mockRejectedValue(new Error('File operation failed'));

      await expect(readCodexSecurityReport('unreadable.json')).rejects.toThrow(
        'File operation failed',
      );

      expect(handle.close).toHaveBeenCalledOnce();
    });

    it('forwards cancellation during a saved report read and closes the handle', async () => {
      const controller = new AbortController();
      const handle = mockReportHandle();
      handle.read.mockImplementation(async (buffer: Buffer) => {
        controller.abort();
        return { buffer, bytesRead: 1 };
      });

      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: path.join(reportDirectory, 'canceled.json') },
      }).callApi('Compare', undefined, { abortSignal: controller.signal });

      expect(response.error).toContain('aborted');
      expect(handle.read).toHaveBeenCalledOnce();
      expect(handle.close).toHaveBeenCalledOnce();
      expect(importModule).not.toHaveBeenCalled();
    });

    it('honors cancellation before opening a saved report', async () => {
      const { file } = await saveReport(createScanResult().toJSON());
      const controller = new AbortController();
      controller.abort();
      const open = vi.spyOn(fs, 'open');
      await expect(readCodexSecurityReport(file, controller.signal)).rejects.toThrow('aborted');
      const response = await new OpenAICodexSecurityProvider({
        config: { report_file: file },
      }).callApi('Compare', undefined, { abortSignal: controller.signal });

      expect(response.error).toContain('aborted');
      expect(open).not.toHaveBeenCalled();
      expect(importModule).not.toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it.each([{ stop_after_no_new: 0 }, { max_time_hours: 97 }])(
      'rejects values outside SDK bounds: %j',
      (config) => {
        expect(() => new OpenAICodexSecurityProvider({ config })).toThrow();
        expect(MockCodexSecurity).not.toHaveBeenCalled();
      },
    );

    it('defaults to the Codex Security provider ID and repository scan operation', async () => {
      const provider = new OpenAICodexSecurityProvider();

      expect(provider.id()).toBe('openai:codex-security');
      expect(provider.requiresApiKey()).toBe(false);
      expect(provider.toString()).toBe('[OpenAI Codex Security Provider]');
      expect(
        (await provider.callApi('Audit this repository')).metadata?.codexSecurity?.operation,
      ).toBe('security-scan');
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

      expect(await provider.callApi('Scan')).toMatchObject({
        error: expect.stringContaining('npm install promptfoo @openai/codex-security'),
      });
    });

    it('explains SDK import and runtime failures', async () => {
      vi.mocked(importModule).mockRejectedValue(new Error('unsupported Node version'));
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toContain('Failed to load @openai/codex-security');
      expect(response.error).toContain('even-numbered Node.js');
      expect(response.error).toContain('npm install promptfoo @openai/codex-security');
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
          ? { ...mockModule, VERSION: incompatibleSdkVersions[0] }
          : mockModule,
      );
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.metadata?.codexSecurity?.versions.sdk).toBe(mockModule.VERSION);
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

      expect(response.metadata?.codexSecurity?.versions.sdk).toBe(mockModule.VERSION);
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

      expect(response.metadata?.codexSecurity?.versions.sdk).toBe(mockModule.VERSION);
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
      vi.mocked(importModule).mockResolvedValue({
        ...mockModule,
        VERSION: incompatibleSdkVersions[0],
      });
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toContain(`package is incompatible (${incompatibleSdkVersions[0]})`);
      const suggestedRange = response.error?.match(
        /npm install promptfoo @openai\/codex-security@(\S+)/,
      )?.[1];
      expect(suggestedRange).toBeDefined();
      expect(validRange(suggestedRange)).not.toBeNull();
      expect(satisfies(mockModule.VERSION, suggestedRange!)).toBe(true);
      for (const incompatibleVersion of incompatibleSdkVersions) {
        expect(satisfies(incompatibleVersion, suggestedRange!)).toBe(false);
      }
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('reports multiple incompatible trusted SDK versions together', async () => {
      const firstTrustedRoot = path.resolve(getDirectory(), '..');
      vi.mocked(resolvePackageEntryPoint).mockImplementation((_packageName, basePath) =>
        basePath === firstTrustedRoot
          ? '/legacy/@openai/codex-security/dist/index.js'
          : '/promptfoo/@openai/codex-security/dist/index.js',
      );
      vi.mocked(importModule).mockImplementation(async (entryPoint) =>
        String(entryPoint).startsWith('/legacy/')
          ? { ...mockModule, VERSION: incompatibleSdkVersions[0] }
          : { ...mockModule, VERSION: incompatibleSdkVersions[1] },
      );
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toContain(
        `package is incompatible (${incompatibleSdkVersions.join(', ')})`,
      );
      expect(response.error).toContain('npm install promptfoo @openai/codex-security@');
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('reports malformed SDK versions as incompatible instead of import failures', async () => {
      vi.mocked(importModule).mockResolvedValue({ ...mockModule, VERSION: 'unknown' });
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toContain('package is incompatible (unknown)');
      expect(response.error).not.toContain('Failed to load @openai/codex-security');
      expect(mockRun).not.toHaveBeenCalled();
    });
  });

  describe('repository scanning', () => {
    it('normalizes findings, usage, reasoning tokens, estimated cost, and artifacts', async () => {
      const result = createScanResult();
      const toJSON = vi.fn(result.toJSON);
      mockRun.mockResolvedValue({ ...result, toJSON });
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
          codexSecurity: {
            version: 1,
            source: { kind: 'sdk', mocked: false },
            operation: 'security-scan',
            status: 'completed',
            model: 'gpt-5.6-sol',
            findings: { total: 1, bySeverity: { high: 1 } },
            coverage: { completeness: 'complete' },
            versions: { plugin: result.pluginVersion, sdk: mockModule.VERSION },
            elapsedMs: 5000,
          },
          skillCalls: [{ name: 'security-scan' }],
        },
      });
      expect(JSON.parse(response.output)).toHaveProperty('findings.findings');
      expect(toJSON).toHaveBeenCalledOnce();
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
      expect(response.metadata?.codexSecurity).toMatchObject({ operation: 'deep-security-scan' });
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

    it('distinguishes SDK prompt-cache tokens from cached Promptfoo scan responses', async () => {
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'deep-security-scan' },
      });

      const freshResponse = await provider.callApi('Run a complete deep scan');
      const tokenUsage = createEmptyTokenUsage();

      accumulateResponseTokenUsage(tokenUsage, { ...freshResponse, cached: true });
      accumulateResponseTokenUsage(tokenUsage, freshResponse);

      expect(freshResponse).toMatchObject({
        cached: false,
        cost: 0.012,
        tokenUsage: { total: 140, cached: 25 },
      });
      expect(tokenUsage).toMatchObject({
        total: 280,
        prompt: 200,
        completion: 80,
        cached: 165,
        numRequests: 2,
        incurredTokenUsage: {
          total: 140,
          prompt: 100,
          completion: 40,
          cached: 25,
          numRequests: 1,
          completionDetails: { reasoning: 12, cacheReadInputTokens: 25 },
        },
      });
    });

    it('resolves repository, output, plugin, and knowledge-base paths from the config directory', async () => {
      const configDirectory = path.resolve('/workspace/evals');
      const expectedPluginVersion = '9.8.7';
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
          expected_plugin_version: expectedPluginVersion,
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
          expectedPluginVersion,
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
        codexSecurity: {
          warnings: ['One generated proof of concept was skipped.'],
          cost: { baselineUsd: 0.004 },
        },
      });
    });

    it('does not fabricate usage or cost when the SDK omits both', async () => {
      mockRun.mockResolvedValue(createScanResult({ cost: null, turnResult: {} }));
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toBeUndefined();
      expect(response.tokenUsage).toBeUndefined();
      expect(response.cost).toBeUndefined();
    });

    // A future SDK could drop `turnResult` entirely. Missing usage metadata must degrade
    // to "no usage reported" -- it must not discard the findings the scan already produced.
    it('still reports findings when the SDK omits turnResult entirely', async () => {
      mockRun.mockResolvedValue(createScanResult({ cost: null, turnResult: undefined }));
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toBeUndefined();
      expect(response.tokenUsage).toBeUndefined();
      expect(response.cost).toBeUndefined();
      expect(response.metadata?.codexSecurity).toMatchObject({
        findings: { total: 1 },
        model: null,
      });
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

      expect(await provider.callApi('Scan')).toMatchObject({
        error: 'Codex Security operation failed: Trusted Access is required',
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('retains observed scan cost and token usage when a paid scan fails', async () => {
      mockRun.mockImplementation(async (_repository, options) => {
        options.onCost({
          model: 'gpt-5.6-sol',
          inputTokens: 500,
          cachedInputTokens: 100,
          cacheWriteInputTokens: 25,
          outputTokens: 200,
          estimatedUsd: 0.08,
        });
        throw new Error('Scan completed without required artifacts');
      });
      const provider = new OpenAICodexSecurityProvider();

      expect(await provider.callApi('Scan')).toMatchObject({
        error: 'Codex Security operation failed: Scan completed without required artifacts',
        cost: 0.08,
        tokenUsage: {
          prompt: 500,
          completion: 200,
          cached: 100,
          total: 700,
          completionDetails: {
            cacheReadInputTokens: 100,
            cacheCreationInputTokens: 25,
          },
        },
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('retains the latest cumulative worker cost when a deep scan fails', async () => {
      mockRun.mockImplementation(async (_repository, options) => {
        options.onCost({
          model: 'gpt-5.6-terra',
          inputTokens: 100,
          cachedInputTokens: 20,
          cacheWriteInputTokens: 5,
          outputTokens: 40,
          estimatedUsd: 0.01,
        });
        options.onCost({
          model: 'gpt-5.6-terra',
          inputTokens: 900,
          cachedInputTokens: 200,
          cacheWriteInputTokens: 40,
          outputTokens: 300,
          estimatedUsd: 0.12,
        });
        throw new Error('Deep scan worker was interrupted');
      });
      const provider = new OpenAICodexSecurityProvider({
        config: { operation: 'deep-security-scan' },
      });

      expect(await provider.callApi('Scan')).toMatchObject({
        error: 'Codex Security operation failed: Deep scan worker was interrupted',
        cost: 0.12,
        tokenUsage: {
          prompt: 900,
          completion: 300,
          cached: 200,
          total: 1200,
        },
      });
    });

    it('retains work already incurred when an active scan is canceled', async () => {
      const controller = new AbortController();
      mockRun.mockImplementation(async (_repository, options) => {
        options.onCost({
          model: 'gpt-5.6-sol',
          inputTokens: 120,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 30,
          estimatedUsd: 0.02,
        });
        controller.abort();
        throw new Error('The scan was interrupted');
      });
      const provider = new OpenAICodexSecurityProvider();

      expect(
        await provider.callApi('Scan', undefined, { abortSignal: controller.signal }),
      ).toMatchObject({
        error: 'Codex Security operation failed: The scan was interrupted',
        cost: 0.02,
        tokenUsage: { prompt: 120, completion: 30, total: 150 },
      });
    });

    it('preserves successful scan results when closing the SDK client fails', async () => {
      mockClose.mockRejectedValue(new Error('cleanup failed'));
      const provider = new OpenAICodexSecurityProvider();

      const response = await provider.callApi('Scan');

      expect(response.error).toBeUndefined();
      expect(response.metadata?.codexSecurity?.operation).toBe('security-scan');
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
        metadata: {
          codexSecurity: { operation: 'validation', validation: { disposition: 'reportable' } },
        },
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
      expect(response.metadata?.codexSecurity?.validation?.disposition).toBe('reportable');
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
