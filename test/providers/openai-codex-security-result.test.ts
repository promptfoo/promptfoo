import { describe, expect, it } from 'vitest';
import { CodexSecurityResultSchema } from '../../src/contracts/codexSecurity';
import { normalizeCodexSecurityResult } from '../../src/providers/openai/codex-security-result';

const sdkContext = { source: { kind: 'sdk' as const }, operation: 'security-scan' };

describe('normalizeCodexSecurityResult', () => {
  it('normalizes current findings and keeps historical findings separate', () => {
    const result = normalizeCodexSecurityResult(
      {
        findings: {
          findings: [
            { severity: { level: 'high' } },
            { severity: { level: 'low' } },
            { severity: { level: 'unexpected' } },
            null,
          ],
        },
        repositoryFindings: [{ severity: { level: 'critical' } }],
        coverage: { completeness: 'partial', mode: 'scoped_path' },
      },
      sdkContext,
    );

    expect(result.findings).toEqual({
      total: 4,
      bySeverity: { critical: 0, high: 1, medium: 0, low: 1, informational: 0, unknown: 2 },
    });
    expect(result.coverage).toEqual({ completeness: 'partial', mode: 'scoped_path' });
    expect(CodexSecurityResultSchema.safeParse(result).success).toBe(true);
  });

  it('distinguishes unreported findings from an explicit empty current findings array', () => {
    expect(normalizeCodexSecurityResult({}, sdkContext).findings).toBeNull();
    expect(
      normalizeCodexSecurityResult({ findings: { findings: [] } }, sdkContext).findings,
    ).toEqual({
      total: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, informational: 0, unknown: 0 },
    });
  });

  it.each([null, undefined, 3, [], '{not json', { findings: { findings: {} } }])(
    'returns a valid unknown summary for malformed data %#',
    (value) => {
      const result = normalizeCodexSecurityResult(value, sdkContext);
      expect(CodexSecurityResultSchema.safeParse(result).success).toBe(true);
      expect(result).toMatchObject({
        findings: null,
        cost: null,
        usage: null,
        elapsedMs: null,
        status: 'unknown',
        coverage: { completeness: 'unknown' },
      });
    },
  );

  it('preserves recorded provenance, target, scope and elapsed time without mutating the source', () => {
    const raw = {
      manifest: {
        scan: {
          id: 'recorded-scan',
          producer: { version: 'recorded-plugin' },
          status: 'completed',
          startedAt: '2026-01-01T12:00:00.000Z',
          completedAt: '2026-01-01T12:01:02.000Z',
          target: { kind: 'git_revision', targetId: 'target-a', revision: 'revision-a' },
          scope: {
            includePaths: ['src'],
            excludePaths: [],
            summary: 'Recorded scope',
            limitations: ['Recorded limitation'],
          },
        },
      },
      turn: { model: 'recorded-model', durationMs: 20 },
    };
    const before = structuredClone(raw);
    const result = normalizeCodexSecurityResult(raw, {
      source: { kind: 'saved-report', file: 'baseline.json', sha256: 'A'.repeat(64) },
    });

    expect(result).toMatchObject({
      source: {
        kind: 'saved-report',
        file: 'baseline.json',
        sha256: 'a'.repeat(64),
        mocked: false,
      },
      operation: null,
      status: 'completed',
      scanId: 'recorded-scan',
      model: 'recorded-model',
      versions: { sdk: null, plugin: 'recorded-plugin' },
      elapsedMs: 62000,
      target: { kind: 'git_revision', id: 'target-a', revision: 'revision-a' },
      scope: {
        includePaths: ['src'],
        excludePaths: [],
        summary: 'Recorded scope',
        limitations: ['Recorded limitation'],
      },
    });
    expect(raw).toEqual(before);
    expect(CodexSecurityResultSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    {},
    { startedAt: 'invalid', completedAt: 'invalid' },
    { startedAt: '2026-01-01T12:01:00Z', completedAt: '2026-01-01T12:00:00Z' },
    { startedAt: '2026-01-01T12:00:00', completedAt: '2026-01-01T12:01:00' },
  ])(
    'does not treat turn duration or invalid timestamps as whole-operation duration %#',
    (scan) => {
      const result = normalizeCodexSecurityResult(
        { manifest: { scan }, turn: { durationMs: 15 } },
        sdkContext,
      );
      expect(result.elapsedMs).toBeNull();
    },
  );

  it('preserves a reported zero duration', () => {
    const result = normalizeCodexSecurityResult(
      {
        manifest: {
          scan: {
            startedAt: '2026-01-01T12:00:00Z',
            completedAt: '2026-01-01T12:00:00Z',
          },
        },
      },
      sdkContext,
    );
    expect(result.elapsedMs).toBe(0);
  });

  it('preserves cost estimates and their recorded pricing provenance', () => {
    const result = normalizeCodexSecurityResult(
      {
        cost: {
          estimatedUsd: 0,
          estimatedUsdRange: { min: 0, max: 0.25, context: 'unknown' },
          pricing: {
            source: 'recorded-pricing',
            asOf: '2026-01-01',
            serviceTier: 'standard',
            context: 'short',
          },
        },
      },
      sdkContext,
    );
    expect(result.cost).toEqual({
      baselineUsd: 0,
      range: { minUsd: 0, maxUsd: 0.25 },
      pricing: {
        source: 'recorded-pricing',
        asOf: '2026-01-01',
        serviceTier: 'standard',
        context: 'short',
      },
    });
  });

  it.each([null, undefined, -1, Infinity, 0.5])(
    'keeps an unreported or invalid upper estimate unknown (%s)',
    (max) => {
      const result = normalizeCodexSecurityResult(
        { cost: { estimatedUsd: 1, estimatedUsdRange: { min: 1, max } } },
        sdkContext,
      );
      expect(result.cost?.range).toEqual({ minUsd: 1, maxUsd: null });
    },
  );

  it('does not estimate cost for unknown pricing or turn validation into a scan', () => {
    const result = normalizeCodexSecurityResult(
      { disposition: 'deferred', turn: { model: 'unpriced-model', usage: { input_tokens: 10 } } },
      { ...sdkContext, operation: 'validation' },
    );
    expect(result.validation).toEqual({ disposition: 'deferred' });
    expect(result.findings).toBeNull();
    expect(result.cost).toBeNull();
    expect(result.usage).toEqual({
      input: 10,
      output: null,
      cachedInput: null,
      cacheWriteInput: null,
      total: null,
    });
  });

  it('retains observed error costs and warnings without inventing completed findings', () => {
    const result = normalizeCodexSecurityResult(undefined, {
      ...sdkContext,
      error: 'Recorded interruption',
      sdkVersion: 'recorded-sdk',
      observedCost: { estimatedUsd: 0.5, model: 'observed-model', inputTokens: 7, outputTokens: 3 },
      warnings: ['First warning', 'First warning', '', null],
      artifactPaths: { scanDir: '/original-host/partial' },
    });
    expect(result).toMatchObject({
      status: 'failed',
      error: 'Recorded interruption',
      versions: { sdk: 'recorded-sdk' },
      model: 'observed-model',
      cost: { baselineUsd: 0.5 },
      usage: { input: 7, output: 3, total: 10 },
      findings: null,
      coverage: { completeness: 'unknown' },
      warnings: ['First warning'],
      artifacts: [{ kind: 'scanDir', path: '/original-host/partial' }],
    });
  });

  it.each(['cost', 'usage'])(
    'preserves unreported cache-write usage from the %s marker',
    (source) => {
      const result = normalizeCodexSecurityResult(
        {
          cost: {
            inputTokens: 0,
            outputTokens: 0,
            cacheWriteInputTokens: 0,
            ...(source === 'cost' ? { cacheWriteInputTokensReported: false } : {}),
          },
          turn: {
            usage: {
              cache_write_input_tokens: 0,
              ...(source === 'usage' ? { cache_write_input_tokens_reported: false } : {}),
            },
          },
        },
        sdkContext,
      );
      expect(result.usage).toMatchObject({ input: 0, output: 0, total: 0, cacheWriteInput: null });
    },
  );

  it('preserves explicit zero tokens and rejects invalid token counts', () => {
    const result = normalizeCodexSecurityResult(
      {
        turn: {
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_write_input_tokens: 0,
            cached_input_tokens: -1,
            total_tokens: Infinity,
          },
        },
      },
      sdkContext,
    );
    expect(result.usage).toEqual({
      input: 0,
      output: 0,
      cachedInput: null,
      cacheWriteInput: 0,
      total: 0,
    });
  });

  it('keeps total tokens consistent with aggregate cost usage instead of the final turn', () => {
    const result = normalizeCodexSecurityResult(
      {
        cost: { inputTokens: 500, outputTokens: 200 },
        turn: { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
      },
      sdkContext,
    );
    expect(result.usage).toMatchObject({ input: 500, output: 200, total: 700 });
  });

  it.each([
    { turn: { mock: true } },
    { mock: true },
    { synthetic: true },
    { manifest: { scan: { extensions: { mock: true } } } },
    { manifest: { scan: { scope: { runtimeStatus: 'mock' } } } },
  ])('marks explicit mock evidence without changing its source kind %#', (evidence) => {
    const result = normalizeCodexSecurityResult(
      { ...evidence, sdkVersion: 'reported-sdk' },
      { source: { kind: 'saved-report', sha256: 'invalid' } },
    );
    expect(result.source).toEqual({ kind: 'saved-report', mocked: true });
    expect(result.versions.sdk).toBe('reported-sdk');
  });

  it('uses explicit artifact paths and preserves warnings as inert text', () => {
    const result = normalizeCodexSecurityResult(
      {
        reportPath: '/old/report.md',
        findingsPath: '/original/findings.json',
        warnings: ['<b>Recorded warning</b>'],
      },
      { ...sdkContext, artifactPaths: { reportPath: '/recorded/report.md' } },
    );
    expect(result.artifacts).toEqual([
      { kind: 'reportPath', path: '/recorded/report.md' },
      { kind: 'findingsPath', path: '/original/findings.json' },
    ]);
    expect(result.warnings).toEqual(['<b>Recorded warning</b>']);
  });

  it('rejects unsupported or invalid normalized contracts at the portable boundary', () => {
    const normalized = normalizeCodexSecurityResult({}, sdkContext);
    expect(CodexSecurityResultSchema.safeParse({ ...normalized, version: 2 }).success).toBe(false);
    expect(CodexSecurityResultSchema.safeParse({ ...normalized, elapsedMs: -1 }).success).toBe(
      false,
    );
    expect(
      CodexSecurityResultSchema.safeParse({ ...normalized, findings: { total: 0 } }).success,
    ).toBe(false);
  });
});
