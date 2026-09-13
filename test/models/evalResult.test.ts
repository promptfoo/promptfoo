import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import EvalResult, {
  sanitizeProvider,
  sanitizeResultForJsonlArtifact,
} from '../../src/models/evalResult';
import { hashPrompt } from '../../src/prompts/utils';
import { WebSocketProvider } from '../../src/providers/websocket';
import {
  type ApiProvider,
  type AtomicTestCase,
  type EvaluateResult,
  type Prompt,
  type ProviderOptions,
  ResultFailureReason,
} from '../../src/types/index';
import {
  getCachedStandaloneEvals,
  getStandaloneEvalCacheKey,
  setCachedStandaloneEvals,
} from '../../src/util/standaloneEvalCache';
import { createEvaluateResult } from '../factories/eval';
import {
  createMockProvider,
  createProviderResponse,
  createRequiredTokenUsage,
} from '../factories/provider';
import { createAtomicTestCase, createPrompt } from '../factories/testSuite';
import { mockProcessEnv } from '../util/utils';

describe('EvalResult', () => {
  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'retains test-owned metadata after removing %s provider echoes',
    async (pluginId) => {
      const secret = 'PRIVATE_METADATA_ECHO';
      const metadata = {
        pluginId,
        strategyId: 'basic',
        goal: 'Inspect a public report',
        pluginConfig: { rawReceipt: secret },
      };
      const echoes = Object.fromEntries(Object.keys(metadata).map((key) => [key, secret]));
      const row = createEvaluateResult({
        ...mockEvaluateResult,
        testCase: {
          assert: [{ type: `promptfoo:redteam:${pluginId}` }],
          metadata: metadata as AtomicTestCase['metadata'],
        },
        metadata: { ...echoes, unrelated: 'retained' },
        response: { output: 'Clean report', metadata: echoes },
      });
      const saved = await EvalResult.createFromEvaluateResult('metadata-echo-' + pluginId, row);
      const [bulk] = await EvalResult.createManyFromEvaluateResult(
        [row],
        'metadata-echo-bulk-' + pluginId,
      );
      for (const result of [
        sanitizeResultForJsonlArtifact(row),
        saved.toEvaluateResult(),
        bulk.toEvaluateResult(),
      ]) {
        expect(result.metadata).toMatchObject({
          pluginId,
          strategyId: 'basic',
          goal: metadata.goal,
          unrelated: 'retained',
        });
        expect(JSON.stringify(result)).not.toContain(secret);
      }
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'omits numeric provider receipts from public %s accounting',
    async (pluginId) => {
      const secret = '1234567890123456';
      const accounting = {
        tokenUsage: {
          prompt: Number(secret),
          completionDetails: { reasoning: Number(secret) },
          incurredTokenUsage: { prompt: Number(secret) },
        },
        cost: Number(secret),
        incurredCost: Number(secret),
        latencyMs: Number(secret),
      };
      const row = createEvaluateResult({
        ...mockEvaluateResult,
        ...accounting,
        tokenUsage: createRequiredTokenUsage(accounting.tokenUsage),
        response: { output: 'Clean report', ...accounting },
        testCase: {
          assert: [{ type: `promptfoo:redteam:${pluginId}`, value: { rawReceipt: secret } }],
        },
      });
      const artifact = sanitizeResultForJsonlArtifact(row);
      const saved = await EvalResult.createFromEvaluateResult('numeric-receipt-' + pluginId, row);
      const [bulk] = await EvalResult.createManyFromEvaluateResult(
        [row],
        'numeric-bulk-' + pluginId,
      );
      for (const value of [artifact, saved.toEvaluateResult(), bulk.toEvaluateResult()]) {
        expect(JSON.stringify(value)).not.toContain(secret);
      }
      expect(row.response?.tokenUsage?.prompt).toBe(Number(secret));
    },
  );

  it.each(
    ['coding-agent:trace-redaction', 'harness:artifact-redaction'].flatMap((pluginId) =>
      [false, true].map((hasResponse) => [pluginId, hasResponse] as const),
    ),
  )('omits private errors for %s with response=%s', async (pluginId, hasResponse) => {
    const secret = 'PRIVATE_ERROR_RECEIPT_8964';
    const row = createEvaluateResult({
      ...mockEvaluateResult,
      testCase: { assert: [{ type: `promptfoo:redteam:${pluginId}` as const }] },
      error: `Request failed: ${secret}`,
      failureReason: ResultFailureReason.ERROR,
      success: false,
      metadata: { errorContext: { statusText: secret, responseSnippet: secret } },
      response: hasResponse ? { error: secret, metadata: { diagnostic: secret } } : undefined,
    });
    if (!hasResponse) {
      delete row.response;
    }
    const artifact = sanitizeResultForJsonlArtifact(row);
    const saved = await EvalResult.createFromEvaluateResult('private-error-' + pluginId, row);
    const [bulk] = await EvalResult.createManyFromEvaluateResult(
      [row],
      'private-error-bulk-' + pluginId,
    );
    for (const value of [artifact, saved.toEvaluateResult(), bulk.toEvaluateResult()]) {
      expect(JSON.stringify(value)).not.toContain(secret);
      expect(value.failureReason).toBe(ResultFailureReason.ERROR);
      expect(value.success).toBe(false);
      expect(value.error).toContain('Error details omitted');
    }
    expect(row.error).toContain(secret);
  });

  it.each([
    'coding-agent:trace-redaction',
    'harness:artifact-redaction',
    'coding-agent:mcp-resource-injection',
    'coding-agent:connector-parameter-exfil',
  ] as const)('redacts verifier inputs in public %s result copies', async (pluginId) => {
    const secret = 'protected fixture receipt';
    const value = {
      rawReceipt: secret,
      mcpResource: { sourceOnlyValue: secret, sourceOnlyValues: [secret] },
      connectorProtectedValue: secret,
      connectorProtectedValues: [secret],
      protectedConnectorValue: secret,
      protectedConnectorValues: [secret],
      connectorParameterExfil: { protectedValue: secret, protectedValues: [secret] },
      sensitiveValues: [secret],
      protectedFiles: [{ path: 'protected.txt', expectedContent: secret }],
      rawReceiptPath: 'fixtures/receipt.txt',
    };
    const row = createEvaluateResult({
      ...mockEvaluateResult,
      testCase: {
        assert: [{ type: `promptfoo:redteam:${pluginId}`, value }],
        metadata: { pluginId, pluginConfig: value } as AtomicTestCase['metadata'],
        vars: { ...value, publicValue: 'original' },
      },
      vars: { ...value, publicValue: 'streamed' },
      metadata: { pluginId, pluginConfig: value },
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'ok',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'ok',
            metadata: { pluginId, pluginConfig: value },
          },
        ],
      },
    });
    const artifact = sanitizeResultForJsonlArtifact(row);
    expect(JSON.stringify(artifact)).not.toContain(secret);
    expect(JSON.stringify(artifact)).toContain('fixtures/receipt.txt');
    expect(artifact.vars?.publicValue).toBe('streamed');
    const saved = await EvalResult.createFromEvaluateResult('verifier-result-' + pluginId, row);
    const [bulk] = await EvalResult.createManyFromEvaluateResult(
      [row],
      'verifier-bulk-' + pluginId,
    );
    for (const result of [saved, bulk]) {
      const persisted = await EvalResult.findById(result.id);
      expect(JSON.stringify(persisted?.toEvaluateResult())).not.toContain(secret);
      expect(JSON.stringify(persisted?.gradingResult)).toContain('fixtures/receipt.txt');
    }
    const legacy = new EvalResult({
      ...saved,
      testCase: row.testCase,
      response: saved.response ?? null,
    });
    expect(JSON.stringify(legacy.toEvaluateResult())).not.toContain(secret);
    expect(legacy.toEvaluateResult().vars?.publicValue).toBe('original');
    expect(JSON.stringify(row)).toContain(secret);
  });

  it.each(
    ['coding-agent:trace-redaction', 'harness:artifact-redaction'].flatMap((pluginId) =>
      [false, true].map((hasResponse) => [pluginId, hasResponse] as const),
    ),
  )('omits saved grader prompts for %s with response=%s', async (pluginId, hasResponse) => {
    const secret = 'PRIVATE_GRADER_PROMPT_RECEIPT';
    const grade = {
      pass: true,
      score: 1,
      reason: 'Public report checked.',
      metadata: { renderedGradingPrompt: `Inspect the output: ${secret}`, cachedResponse: false },
    };
    const row = createEvaluateResult({
      ...mockEvaluateResult,
      testCase: { assert: [{ type: `promptfoo:redteam:${pluginId}` as const }] },
      response: { output: secret },
      gradingResult: { ...grade, componentResults: [{ ...grade, componentResults: [grade] }] },
    });
    if (!hasResponse) {
      delete row.response;
    }
    const saved = await EvalResult.createFromEvaluateResult('grader-prompt-' + pluginId, row);
    const [bulk] = await EvalResult.createManyFromEvaluateResult([row], 'grader-bulk-' + pluginId);
    for (const result of [sanitizeResultForJsonlArtifact(row), saved, bulk]) {
      expect(JSON.stringify(result.gradingResult)).not.toContain(secret);
      expect(result.gradingResult).toMatchObject({
        pass: true,
        score: 1,
        reason: grade.reason,
        metadata: { cachedResponse: false },
      });
    }
    const ordinary = sanitizeResultForJsonlArtifact({ ...row, testCase: { assert: [] } });
    expect(ordinary.gradingResult?.metadata?.renderedGradingPrompt).toContain(secret);
    expect(row.gradingResult?.metadata?.renderedGradingPrompt).toContain(secret);
  });

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'])(
    'omits leaked text and provider metadata from public %s result copies',
    async (pluginId) => {
      const secret = 'PRIVATE_TEXT_RECEIPT_8964';
      const row = createEvaluateResult({
        ...mockEvaluateResult,
        response: {
          output: secret,
          sessionId: secret,
          metadata: { diagnostic: secret },
          tokenUsage: { prompt: secret, completion: 2 } as any,
          cost: 0.01,
        },
        metadata: { diagnostic: secret, sessionId: secret, custom: 'retained' },
        tokenUsage: { prompt: secret, completion: 2 } as any,
        testCase: { assert: [{ type: `promptfoo:redteam:${pluginId}` as const }] },
        gradingResult: { pass: false, score: 0, reason: 'Protected receipt found.' },
      });
      const artifact = sanitizeResultForJsonlArtifact(row);
      expect(JSON.stringify(artifact)).not.toContain(secret);
      expect(artifact.response).toMatchObject({
        metadata: { redactionContentOmitted: true },
      });
      expect(artifact.metadata?.custom).toBe('retained');
      const saved = await EvalResult.createFromEvaluateResult('text-copy-' + pluginId, row);
      const [bulk] = await EvalResult.createManyFromEvaluateResult([row], 'text-bulk-' + pluginId);
      for (const result of [saved, bulk]) {
        const persisted = await EvalResult.findById(result.id);
        expect(JSON.stringify(persisted?.toEvaluateResult())).not.toContain(secret);
        expect(persisted?.gradingResult?.reason).toBe('Protected receipt found.');
      }
      expect(row.response?.output).toBe(secret);
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'])(
    'omits image-bearing %s responses and their metadata echoes from result copies',
    async (pluginId) => {
      const image =
        'data:image/svg+xml;base64,' +
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><text>PRIVATE_PIXEL_RECEIPT</text></svg>',
        ).toString('base64');
      const response = {
        output: `![report](${image})`,
        images: [{ data: image, mimeType: 'image/svg+xml' }],
        raw: { image },
        metadata: { screenshot: image },
        cost: 0.01,
      };
      const row = createEvaluateResult({
        ...mockEvaluateResult,
        response,
        testCase: {
          assert: [
            {
              type: 'assert-set',
              assert: [
                {
                  type: `promptfoo:redteam:${pluginId}` as const,
                },
              ],
            },
          ],
        },
        metadata: { screenshot: image, custom: 'retained' },
      });
      const artifact = sanitizeResultForJsonlArtifact(row);
      expect(JSON.stringify(artifact)).not.toContain(image);
      expect(artifact.response).toMatchObject({
        metadata: { redactionMediaOmitted: true },
      });
      expect(artifact.metadata?.custom).toBe('retained');
      expect(row.response?.images?.[0].data).toBe(image);
      const saved = await EvalResult.createFromEvaluateResult('image-redaction-copy', row, {
        persist: false,
      });
      expect(JSON.stringify(saved.toEvaluateResult())).not.toContain(image);
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'])(
    'omits audio-bearing %s responses from result copies',
    async (pluginId) => {
      const data = Buffer.from('PRIVATE_AUDIO_ARTIFACT_RECEIPT').toString('base64');
      const response = {
        output: data,
        audio: { data, format: 'wav' },
        raw: { data },
        metadata: { audioEcho: data },
        cost: 0.01,
      };
      const row = createEvaluateResult({
        ...mockEvaluateResult,
        response,
        testCase: { assert: [{ type: `promptfoo:redteam:${pluginId}` as const }] },
        metadata: { audioEcho: data, custom: 'retained' },
      });
      const artifact = sanitizeResultForJsonlArtifact(row);
      expect(JSON.stringify(artifact)).not.toContain(data);
      expect(artifact.response).toMatchObject({
        metadata: { redactionMediaOmitted: true },
      });
      expect(artifact.metadata?.custom).toBe('retained');
      const saved = await EvalResult.createFromEvaluateResult('audio-redaction-copy', row, {
        persist: false,
      });
      expect(JSON.stringify(saved.toEvaluateResult())).not.toContain(data);
      expect(row.response?.audio?.data).toBe(data);
    },
  );

  it.each([
    'output-image',
    'output-audio',
    'metadata-audio',
    'turn-audio',
    'nested-image',
    'image-json',
    'blob-output',
    'svg-output',
  ] as const)('omits private media in supported response shapes: %s', async (mode) => {
    const secret = 'PRIVATE_EMBEDDED_MEDIA_8964';
    const data = Buffer.from(secret).toString('base64');
    const image = `data:image/png;base64,${data}`;
    const media = {
      'output-image': { output: image },
      'output-audio': { output: `data:audio/wav;base64,${data}` },
      'metadata-audio': { metadata: { audio: { data, format: 'wav' } } },
      'turn-audio': { turns: [{ audio: { data, format: 'wav' } }] },
      'nested-image': { metadata: { content: [{ image_url: { url: image } }] } },
      'image-json': { output: JSON.stringify({ data: [{ b64_json: data }] }) },
      'blob-output': { output: `promptfoo://blob/${'a'.repeat(64)}` },
      'svg-output': {
        output: `<svg xmlns="http://www.w3.org/2000/svg"><text>${secret}</text></svg>`,
      },
    }[mode];
    const row = createEvaluateResult({
      ...mockEvaluateResult,
      response: { output: 'Clean report', ...media, cost: 0.01 },
      testCase: { assert: [{ type: 'promptfoo:redteam:coding-agent:trace-redaction' }] },
    });
    const artifact = sanitizeResultForJsonlArtifact(row);
    expect(artifact.response).toMatchObject({
      metadata: { redactionMediaOmitted: true },
    });
    expect(JSON.stringify(artifact)).not.toContain(data);
    expect(JSON.stringify(artifact)).not.toContain(secret);
    const saved = await EvalResult.createFromEvaluateResult('embedded-media-copy', row, {
      persist: false,
    });
    expect(saved.response).toMatchObject({ metadata: { redactionMediaOmitted: true } });
    expect(row.response).toMatchObject(media);
  });

  it('omits private raw provider data without changing ordinary raw responses', async () => {
    const raw = { privateReceipt: 'PRIVATE_RAW_PROVIDER_8964' };
    const row = createEvaluateResult({
      ...mockEvaluateResult,
      response: { output: 'Clean report', raw },
      testCase: { assert: [{ type: 'promptfoo:redteam:harness:artifact-redaction' }] },
    });
    const artifact = sanitizeResultForJsonlArtifact(row);
    expect(artifact.response?.raw).toBeUndefined();
    expect(artifact.response?.metadata?.redactionContentOmitted).toBe(true);
    const saved = await EvalResult.createFromEvaluateResult('private-raw-copy', row, {
      persist: false,
    });
    expect(saved.response?.raw).toBeUndefined();
    expect(row.response?.raw).toEqual(raw);
    row.testCase.assert = [{ type: 'equals', value: 'Clean report' }];
    expect(sanitizeResultForJsonlArtifact(row).response?.raw).toEqual(raw);
  });

  it('preserves audio responses for ordinary assertions', () => {
    const response = { output: 'audio', audio: { data: 'private-audio', format: 'wav' } };
    expect(
      sanitizeResultForJsonlArtifact({
        response,
        testCase: { assert: [{ type: 'contains', value: 'audio' }] },
      }).response,
    ).toEqual(response);
  });

  it('preserves image responses for ordinary assertions', () => {
    const row = {
      response: { output: 'image', images: [{ data: 'data:image/png;base64,abc' }] },
      testCase: { assert: [{ type: 'contains', value: 'image' }] },
    };
    expect(sanitizeResultForJsonlArtifact(row).response).toEqual(row.response);
  });

  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const mockProvider: ProviderOptions = {
    id: 'test-provider',
    label: 'Test Provider',
  };

  const mockTestCase: AtomicTestCase = createAtomicTestCase({ provider: mockProvider });

  const mockPrompt: Prompt = createPrompt('Test prompt', {
    display: 'Test prompt',
    label: 'Test label',
  });

  const mockEvaluateResult: EvaluateResult = createEvaluateResult({
    prompt: mockPrompt,
    provider: mockProvider,
    testCase: mockTestCase,
    latencyMs: 100,
    cost: 0.01,
    metadata: {},
    id: 'test-id',
    promptId: hashPrompt(mockPrompt),
    response: undefined,
  });

  describe('sanitizeProvider', () => {
    it('should handle ApiProvider objects', () => {
      const apiProvider = createMockProvider({
        id: 'test-provider',
        label: 'Test Provider',
        response: createProviderResponse({ output: 'test' }),
        config: { apiKey: 'test-key' },
      });

      const result = sanitizeProvider(apiProvider);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should handle ProviderOptions objects', () => {
      const providerOptions: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
        },
      };

      const result = sanitizeProvider(providerOptions);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should handle generic objects with id function', () => {
      const provider = {
        id: () => 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
        },
      } as ApiProvider;

      const result = sanitizeProvider(provider);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should redact env-rendered credentials from templated WebSocket provider data', () => {
      const provider = new WebSocketProvider('websocket', {
        config: {
          url: 'ws://127.0.0.1/sessions/{{ sessionId }}?token=runtime-secret',
          messageTemplate: '{{ prompt }}',
        },
      });

      expect(sanitizeProvider(provider)).toEqual({
        id: 'ws://127.0.0.1/sessions/{{ sessionId }}?token=%5BREDACTED%5D',
        label: undefined,
        config: {
          url: 'ws://127.0.0.1/sessions/{{ sessionId }}?token=%5BREDACTED%5D',
          messageTemplate: '{{ prompt }}',
        },
      });
    });
  });

  describe('createFromEvaluateResult', () => {
    it('should create and persist an EvalResult', async () => {
      const evalId = 'test-eval-id';
      const result = await EvalResult.createFromEvaluateResult(evalId, mockEvaluateResult);

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.evalId).toBe(evalId);
      expect(result.promptId).toBe(hashPrompt(mockPrompt));
      expect(result.persisted).toBe(true);

      // Verify it was persisted to database
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.score).toBe(mockEvaluateResult.score);
    });

    it('should create without persisting when persist option is false', async () => {
      const evalId = 'test-eval-id';
      const result = await EvalResult.createFromEvaluateResult(evalId, mockEvaluateResult, {
        persist: false,
      });

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.persisted).toBe(false);

      // Verify it was not persisted to database
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).toBeNull();
    });

    it('should preserve response headers when persist option is false', async () => {
      const result = await EvalResult.createFromEvaluateResult(
        'test-eval-non-persisted-headers',
        {
          ...mockEvaluateResult,
          response: createProviderResponse({
            output: 'test',
            metadata: {
              http: {
                status: 200,
                statusText: 'OK',
                headers: {
                  'content-type': 'application/json',
                  'x-request-id': 'req_in_memory',
                },
              },
            },
          }),
        },
        { persist: false },
      );

      expect(result.persisted).toBe(false);
      expect(result.response?.metadata?.http?.headers).toEqual({
        'content-type': 'application/json',
        'x-request-id': 'req_in_memory',
      });
    });

    it('preserves trace linkage across single-row persistence', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-trace-linkage', {
        ...mockEvaluateResult,
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: { source: 'single' },
      });

      const retrieved = await EvalResult.findById(result.id);

      expect(retrieved?.toEvaluateResult()).toMatchObject({
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: { source: 'single' },
      });
    });

    it('warns and overwrites when user metadata.__promptfoo is non-object', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const result = await EvalResult.createFromEvaluateResult('test-eval-non-object-promptfoo', {
        ...mockEvaluateResult,
        traceId: 'wins-over-user',
        evaluationId: 'wins-over-user',
        metadata: { userKey: 'kept', __promptfoo: 'unexpected-string' as any },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('non-object metadata.__promptfoo'),
      );
      // Trace linkage takes precedence; non-object value is overwritten (not preserved).
      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'wins-over-user',
        evaluationId: 'wins-over-user',
        metadata: { userKey: 'kept' },
      });
      // The read-side strip happens on findById, not just construction.
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
      expect(retrieved?.toEvaluateResult().metadata).toEqual({ userKey: 'kept' });
    });

    it('warns before replacing an existing reserved traceLinkage property', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const result = await EvalResult.createFromEvaluateResult('test-eval-existing-linkage', {
        ...mockEvaluateResult,
        traceId: 'internal-trace',
        evaluationId: 'internal-evaluation',
        metadata: {
          __promptfoo: {
            traceLinkage: { traceId: 'user-trace', evaluationId: 'user-evaluation' },
            retained: 'user-metadata',
          },
        },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('metadata.__promptfoo.traceLinkage'),
      );
      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'internal-trace',
        evaluationId: 'internal-evaluation',
        metadata: { __promptfoo: { retained: 'user-metadata' } },
      });
    });

    it('strips user-supplied reserved trace linkage from untraced rows', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-injected-linkage', {
        ...mockEvaluateResult,
        metadata: {
          __promptfoo: {
            traceLinkage: { traceId: 'user-trace', evaluationId: 'user-evaluation' },
            retained: 'user-metadata',
          },
        },
      });

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        metadata: { __promptfoo: { retained: 'user-metadata' } },
      });
      expect(retrieved?.traceId).toBeUndefined();
      expect(retrieved?.evaluationId).toBeUndefined();
    });

    it('round-trips evaluationId without traceId (malformed traceparent path)', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-only-id', {
        ...mockEvaluateResult,
        evaluationId: 'eval-only',
        metadata: { source: 'eval-only-test' },
      });

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        evaluationId: 'eval-only',
        metadata: { source: 'eval-only-test' },
      });
      expect(retrieved?.toEvaluateResult().traceId).toBeUndefined();
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
    });

    it('preserves user metadata alongside persisted trace linkage', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-user-metadata', {
        ...mockEvaluateResult,
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: {
          __traceId: 'user-trace-id',
          __evaluationId: 'user-evaluation-id',
          __promptfoo: { source: 'user' },
        },
      });

      expect(result.metadata).toEqual({
        __traceId: 'user-trace-id',
        __evaluationId: 'user-evaluation-id',
        __promptfoo: { source: 'user' },
      });
      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: {
          __traceId: 'user-trace-id',
          __evaluationId: 'user-evaluation-id',
          __promptfoo: { source: 'user' },
        },
      });
    });

    it('should properly handle circular references in provider', async () => {
      const evalId = 'test-eval-id';

      // Create a provider with a circular reference
      const circularProvider: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: undefined as any,
        },
      };
      circularProvider.config.circular = circularProvider;

      const testCaseWithCircular: AtomicTestCase = {
        ...mockTestCase,
        provider: circularProvider,
      };

      const resultWithCircular = await EvalResult.createFromEvaluateResult(
        evalId,
        {
          ...mockEvaluateResult,
          provider: circularProvider,
          testCase: testCaseWithCircular,
        },
        { persist: true },
      );

      // Verify the provider was properly serialized
      expect(resultWithCircular.provider).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: {
            id: 'test-provider',
            label: 'Test Provider',
          },
        },
      });

      // Verify it can be persisted without errors
      const retrieved = await EvalResult.findById(resultWithCircular.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.provider).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: {
            id: 'test-provider',
            label: 'Test Provider',
          },
        },
      });
    });

    // Regression test for #7266: Node.js Timeout objects contain circular
    // _idlePrev/_idleNext references, which previously caused
    // "Converting circular structure to JSON" failures during result serialization.
    it('should handle results with Timeout objects (regression test for #7266)', async () => {
      const evalId = 'test-eval-timeout';

      // Create a result with a Node.js Timeout object in metadata
      // This simulates the issue reported in GitHub #7266 where Python providers
      // could leak Timeout objects into results, causing "Converting circular structure to JSON" errors
      const timeoutHandle = setTimeout(() => {}, 10000);

      try {
        const resultWithTimeout: EvaluateResult = {
          ...mockEvaluateResult,
          metadata: {
            someData: 'value',
            // Simulate a leaked timer - this has circular _idlePrev/_idleNext references
            leakedTimer: timeoutHandle as unknown as string,
          },
        };

        // This should NOT throw "Converting circular structure to JSON"
        const result = await EvalResult.createFromEvaluateResult(evalId, resultWithTimeout, {
          persist: true,
        });

        // The result should be saved successfully
        expect(result).toBeInstanceOf(EvalResult);
        expect(result.persisted).toBe(true);

        // Verify it can be retrieved from the database
        const retrieved = await EvalResult.findById(result.id);
        expect(retrieved).not.toBeNull();

        // The metadata should be sanitized (timer stripped or converted to empty object)
        // Either approach is acceptable - the key is that it doesn't throw
        expect(retrieved?.metadata).toBeDefined();
      } finally {
        clearTimeout(timeoutHandle);
      }
    });

    it('should handle results with functions in response (non-serializable)', async () => {
      const evalId = 'test-eval-function';

      // Create a response with non-serializable data (functions)
      // This simulates data that might leak from providers
      const responseWithFunction = {
        output: 'test output',
        someCallback: () => {},
      };

      const resultWithFunctions: EvaluateResult = {
        ...mockEvaluateResult,
        // Cast to bypass type checking - simulating runtime contamination
        response: responseWithFunction as unknown as typeof mockEvaluateResult.response,
      };

      // This should NOT throw
      const result = await EvalResult.createFromEvaluateResult(evalId, resultWithFunctions, {
        persist: true,
      });

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.persisted).toBe(true);

      // Verify the output was preserved
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.response?.output).toBe('test output');
    });

    // Regression context (PR #8688): provider credentials such as apiKey/token
    // were leaking into persisted eval results and API-visible response payloads.
    describe('credential redaction (regression for PR #8688 review)', () => {
      it('redacts apiKey in testCase.options.provider.config', async () => {
        const evalId = 'test-eval-redact-options-provider';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            testCase: {
              vars: {},
              options: {
                provider: {
                  id: 'anthropic:messages:claude-3-haiku',
                  config: { apiKey: 'sk-ant-api03-SHOULD-BE-REDACTED' },
                },
              },
            } as AtomicTestCase,
          },
          { persist: true },
        );

        const serialized = JSON.stringify(result.testCase);
        expect(serialized).not.toContain('sk-ant-api03-SHOULD-BE-REDACTED');
        expect(serialized).toContain('[REDACTED]');

        // Also verify the DB-persisted row is clean.
        const retrieved = await EvalResult.findById(result.id);
        expect(JSON.stringify(retrieved?.testCase)).not.toContain(
          'sk-ant-api03-SHOULD-BE-REDACTED',
        );
      });

      it('redacts apiKey in prompt.config.provider.config', async () => {
        const evalId = 'test-eval-redact-prompt-provider';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            prompt: {
              ...mockPrompt,
              config: {
                provider: {
                  id: 'anthropic:messages:claude-3-haiku',
                  config: { apiKey: 'sk-ant-api03-PROMPT-SHOULD-BE-REDACTED' },
                },
              },
            } as unknown as Prompt,
          },
          { persist: true },
        );

        const serialized = JSON.stringify(result.prompt);
        expect(serialized).not.toContain('sk-ant-api03-PROMPT-SHOULD-BE-REDACTED');
        expect(serialized).toContain('[REDACTED]');

        const retrieved = await EvalResult.findById(result.id);
        expect(JSON.stringify(retrieved?.prompt)).not.toContain(
          'sk-ant-api03-PROMPT-SHOULD-BE-REDACTED',
        );
      });

      it('redacts sensitive provider response headers without changing output', async () => {
        const evalId = 'test-eval-redact-response-headers';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            metadata: {
              http: {
                status: 200,
                statusText: 'OK',
                headers: {
                  'openai-project': 'metadata_proj_should_not_persist',
                  'set-cookie': 'metadata-session=secret',
                  'x-ratelimit-remaining-requests': '199',
                },
              },
            },
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'ok',
              componentResults: [
                {
                  pass: true,
                  score: 1,
                  reason: 'ok',
                  metadata: {
                    http: {
                      status: 200,
                      statusText: 'OK',
                      headers: {
                        'openai-project': 'grading_proj_should_not_persist',
                        'set-cookie': 'grading-session=secret',
                        'x-ratelimit-remaining-requests': '2399',
                      },
                    },
                  },
                },
              ],
            },
            response: createProviderResponse({
              output: {
                password: 'model output should stay intact',
              },
              metadata: {
                http: {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    'content-type': 'application/json',
                    'openai-project': 'proj_should_not_persist',
                    'set-cookie': 'session=secret',
                    'x-ratelimit-remaining-requests': '199',
                    'x-request-id': 'req_should_not_persist',
                  },
                  requestHeaders: {
                    authorization: 'Bearer sk-should-not-persist',
                    'api-key': 'azure-api-key-should-not-persist',
                    'X-API-Key': 'custom-api-key-should-not-persist',
                    'x-safe-debug': 'keep-me',
                  },
                },
              },
            }),
          },
          { persist: true },
        );

        expect(result.response?.output).toEqual({ password: 'model output should stay intact' });
        expect(result.response?.metadata?.http?.headers).toEqual({
          'content-type': 'application/json',
          'openai-project': '[REDACTED]',
          'set-cookie': '[REDACTED]',
          'x-ratelimit-remaining-requests': '[REDACTED]',
          'x-request-id': '[REDACTED]',
        });
        expect(result.response?.metadata?.http?.requestHeaders).toEqual({
          authorization: '[REDACTED]',
          'api-key': '[REDACTED]',
          'X-API-Key': '[REDACTED]',
          'x-safe-debug': 'keep-me',
        });
        expect(result.metadata?.http?.headers).toEqual({
          'openai-project': '[REDACTED]',
          'set-cookie': '[REDACTED]',
          'x-ratelimit-remaining-requests': '[REDACTED]',
        });
        expect(result.gradingResult?.componentResults?.[0].metadata?.http?.headers).toEqual({
          'openai-project': '[REDACTED]',
          'set-cookie': '[REDACTED]',
          'x-ratelimit-remaining-requests': '[REDACTED]',
        });

        const retrieved = await EvalResult.findById(result.id);
        expect(JSON.stringify(retrieved?.response)).not.toContain('proj_should_not_persist');
        expect(JSON.stringify(retrieved?.response)).not.toContain('session=secret');
        expect(JSON.stringify(retrieved?.response)).not.toContain('req_should_not_persist');
        expect(JSON.stringify(retrieved?.response)).not.toContain('sk-should-not-persist');
        expect(JSON.stringify(retrieved?.response)).not.toContain(
          'azure-api-key-should-not-persist',
        );
        expect(JSON.stringify(retrieved?.response)).not.toContain(
          'custom-api-key-should-not-persist',
        );
        expect(JSON.stringify(retrieved?.metadata)).not.toContain(
          'metadata_proj_should_not_persist',
        );
        expect(JSON.stringify(retrieved?.metadata)).not.toContain('metadata-session=secret');
        expect(JSON.stringify(retrieved?.gradingResult)).not.toContain(
          'grading_proj_should_not_persist',
        );
        expect(JSON.stringify(retrieved?.gradingResult)).not.toContain('grading-session=secret');
      });

      it('preserves arbitrary legacy headers in grading metadata', async () => {
        const evalId = 'test-eval-preserve-grading-metadata-headers';
        const gradingMetadataHeaders = {
          'set-cookie': ['user-authored-grading-cookie'],
          'x-request-id': {
            value: 'user-authored-grading-request-id',
          },
        };
        const componentMetadataHeaders = {
          'x-request-id': 'user-authored-component-request-id',
        };

        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'ok',
              metadata: {
                headers: gradingMetadataHeaders,
              },
              componentResults: [
                {
                  pass: true,
                  score: 1,
                  reason: 'ok',
                  metadata: {
                    headers: componentMetadataHeaders,
                  },
                },
              ],
            },
          },
          { persist: true },
        );

        // Grading metadata has no transport provenance, so its arbitrary `headers` must be kept.
        expect(result.gradingResult?.metadata?.headers).toEqual(gradingMetadataHeaders);
        expect(result.gradingResult?.componentResults?.[0].metadata?.headers).toEqual(
          componentMetadataHeaders,
        );

        const retrieved = await EvalResult.findById(result.id);
        expect(retrieved?.gradingResult?.metadata?.headers).toEqual(gradingMetadataHeaders);
        expect(retrieved?.gradingResult?.componentResults?.[0].metadata?.headers).toEqual(
          componentMetadataHeaders,
        );
      });

      it('preserves user-controlled `http` keys nested inside response.output, response.metadata, and gradingResult', async () => {
        // Regression: a previous implementation walked any nested `http` key in the
        // response/metadata/gradingResult tree and rewrote `headers` /
        // `requestHeaders`. Legitimate model output that happens to contain an
        // `http` key (e.g. an agent describing a request it observed) must survive
        // persistence intact. See PR #8876 review thread.
        const evalId = 'test-eval-redact-scope-output';
        const userOutputHttp = {
          headers: {
            'x-request-id': 'user-controlled-id-keep-me',
            'set-cookie': 'user-controlled-cookie-keep-me',
            authorization: 'Bearer user-output-token-keep-me',
          },
        };

        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            metadata: {
              // arbitrary user metadata path that happens to use `http` as a key
              // — must NOT be rewritten because it isn't `metadata.http`.
              traces: [{ http: { headers: { 'x-request-id': 'trace-keep-me' } } }],
            },
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'ok',
              componentResults: [
                {
                  pass: true,
                  score: 1,
                  reason: 'ok',
                  metadata: {
                    judgeOutput: {
                      // legitimate judge output: a model describing http traffic
                      http: { headers: { authorization: 'Bearer keep-me-too' } },
                    },
                  },
                },
              ],
            },
            response: createProviderResponse({
              output: {
                http: userOutputHttp,
                quote: 'cf-ray was: abc-123',
              },
              audio: {
                // an arbitrary `http` key inside a nested non-metadata field
                http: { headers: { 'set-cookie': 'audio-http-keep-me' } },
              } as any,
            }),
          },
          { persist: true },
        );

        // Output stays bit-identical
        expect((result.response?.output as any).http).toEqual(userOutputHttp);
        expect((result.response?.output as any).quote).toBe('cf-ray was: abc-123');
        expect((result.response?.audio as any)?.http?.headers?.['set-cookie']).toBe(
          'audio-http-keep-me',
        );

        // Top-level result.metadata has no metadata.http, so nothing redacts
        expect(result.metadata?.traces?.[0]?.http?.headers?.['x-request-id']).toBe('trace-keep-me');

        // gradingResult.componentResults[].metadata only redacts metadata.http,
        // not metadata.judgeOutput.http
        expect(
          (result.gradingResult?.componentResults?.[0]?.metadata as Record<string, any> | undefined)
            ?.judgeOutput?.http?.headers?.authorization,
        ).toBe('Bearer keep-me-too');

        // Round-trip through DB: nothing was rewritten
        const retrieved = await EvalResult.findById(result.id);
        const serialized = JSON.stringify(retrieved);
        expect(serialized).toContain('user-controlled-id-keep-me');
        expect(serialized).toContain('user-controlled-cookie-keep-me');
        expect(serialized).toContain('user-output-token-keep-me');
        expect(serialized).toContain('audio-http-keep-me');
        expect(serialized).toContain('trace-keep-me');
        expect(serialized).toContain('keep-me-too');
        expect(serialized).toContain('cf-ray was: abc-123');
      });

      it('redacts headers added in this PR (proxy-authorization, x-amzn-requestid, x-trace-id, etc.)', async () => {
        const evalId = 'test-eval-redact-extended-headers';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            response: createProviderResponse({
              output: 'hello',
              metadata: {
                http: {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    'content-type': 'application/json',
                    'proxy-authorization': 'Basic proxy-secret',
                    'x-amzn-requestid': 'req_amzn_should_redact',
                    'x-amzn-trace-id': 'Root=trace-id',
                    'x-amz-security-token': 'amz-token-secret',
                    'x-amz-cf-id': 'cf-id-secret',
                    'x-azure-ref': 'azure-ref-secret',
                    'x-correlation-id': 'corr-secret',
                    'x-trace-id': 'trace-secret',
                    'cf-cache-status': 'HIT',
                    'openai-version': '2024-01-01',
                    via: '1.1 proxy.example',
                    // header name that doesn't match — must be preserved
                    'x-safe-debug': 'keep-me',
                  },
                },
              },
            }),
          },
          { persist: true },
        );

        expect(result.response?.metadata?.http?.headers).toEqual({
          'content-type': 'application/json',
          'proxy-authorization': '[REDACTED]',
          'x-amzn-requestid': '[REDACTED]',
          'x-amzn-trace-id': '[REDACTED]',
          'x-amz-security-token': '[REDACTED]',
          'x-amz-cf-id': '[REDACTED]',
          'x-azure-ref': '[REDACTED]',
          'x-correlation-id': '[REDACTED]',
          'x-trace-id': '[REDACTED]',
          'cf-cache-status': '[REDACTED]',
          'openai-version': '[REDACTED]',
          via: '[REDACTED]',
          'x-safe-debug': 'keep-me',
        });
      });

      it('redacts response headers regardless of header-name casing', async () => {
        const evalId = 'test-eval-redact-casing';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            response: createProviderResponse({
              output: 'hello',
              metadata: {
                http: {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    Authorization: 'Bearer mixed-case-secret',
                    'Set-Cookie': 'session=mixed',
                    'CF-RAY': 'cf-mixed',
                    'X-Request-Id': 'req-mixed',
                    'X-RateLimit-Remaining': '99',
                  },
                },
              },
            }),
          },
          { persist: true },
        );

        expect(result.response?.metadata?.http?.headers).toEqual({
          Authorization: '[REDACTED]',
          'Set-Cookie': '[REDACTED]',
          'CF-RAY': '[REDACTED]',
          'X-Request-Id': '[REDACTED]',
          'X-RateLimit-Remaining': '[REDACTED]',
        });
      });

      it('redacts credentials from an instantiated provider object embedded in testCase.options.provider', async () => {
        // Mimic the real Anthropic / Bedrock shape: the resolved judge provider is an
        // ApiProvider instance whose internal SDK client carries `apiKey`, `_options`,
        // `authToken`, and circular `_client` back-references. Before the fix, all of
        // these survived sanitizeForDb (which only strips circular refs) and persisted
        // through the eval results API.
        const sdkClientA: { _client?: unknown; apiKey: string; _options: { apiKey: string } } = {
          apiKey: 'sk-ant-api03-INSTANCE-KEY',
          _options: { apiKey: 'sk-ant-api03-INSTANCE-KEY' },
        };
        sdkClientA._client = sdkClientA;
        const instantiatedProvider = {
          id: () => 'anthropic:messages:claude-3-haiku',
          label: 'Judge',
          config: { apiKey: 'sk-ant-api03-CONFIG-KEY' },
          apiKey: 'sk-ant-api03-TOPLEVEL-KEY',
          anthropic: sdkClientA,
          callApi: async () => ({ output: 'ok' }),
        };

        const evalId = 'test-eval-redact-instantiated';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            testCase: {
              vars: {},
              options: {
                provider: instantiatedProvider as unknown as ApiProvider,
              },
            } as AtomicTestCase,
          },
          { persist: true },
        );

        const serialized = JSON.stringify(result.testCase);
        expect(serialized).not.toContain('sk-ant-api03-INSTANCE-KEY');
        expect(serialized).not.toContain('sk-ant-api03-CONFIG-KEY');
        expect(serialized).not.toContain('sk-ant-api03-TOPLEVEL-KEY');
        expect(serialized).toContain('[REDACTED]');
      });

      it('does not crash when redacting a provider with a live circular SDK client', async () => {
        const sdkClient: { _client?: unknown; apiKey: string } = { apiKey: 'sk-live-leak' };
        sdkClient._client = sdkClient;
        const cyclicProvider = {
          id: 'anthropic:messages:claude-3-haiku',
          config: { apiKey: 'sk-live-leak', sdk: sdkClient },
        };

        const evalId = 'test-eval-redact-cyclic';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            testCase: {
              vars: {},
              options: { provider: cyclicProvider },
            } as AtomicTestCase,
          },
          { persist: true },
        );

        expect(result.persisted).toBe(true);
        expect(JSON.stringify(result.testCase)).not.toContain('sk-live-leak');
      });
    });

    it('should redact apiKey while preserving non-circular nested provider properties', async () => {
      const evalId = 'test-eval-id';

      const providerWithNestedData: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'secret-key',
          options: {
            temperature: 0.7,
            maxTokens: 100,
          },
        },
      };

      const result = await EvalResult.createFromEvaluateResult(
        evalId,
        {
          ...mockEvaluateResult,
          provider: providerWithNestedData,
          testCase: { ...mockTestCase, provider: providerWithNestedData },
        },
        { persist: true },
      );

      // Verify secrets are redacted while nested non-secret properties are preserved
      expect(result.provider?.config?.apiKey).toBe('[REDACTED]');
      expect(result.provider?.config?.options).toEqual({
        temperature: 0.7,
        maxTokens: 100,
      });

      // Verify it can be persisted and retrieved with redaction and nested properties intact
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.provider?.config?.apiKey).toBe('[REDACTED]');
      expect(retrieved?.provider?.config?.options).toEqual({
        temperature: 0.7,
        maxTokens: 100,
      });
    });
  });

  describe('findManyByEvalId', () => {
    it('should retrieve multiple results for an eval ID', async () => {
      const evalId = 'test-eval-id-multiple';

      // Create multiple results
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        testCase: mockTestCase,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        testCase: mockTestCase,
      });

      const results = await EvalResult.findManyByEvalId(evalId);
      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(EvalResult);
      expect(results[1]).toBeInstanceOf(EvalResult);
    });

    it('should filter by testIdx when provided', async () => {
      const evalId = 'test-eval-id-filter';

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        testCase: mockTestCase,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        testCase: mockTestCase,
      });

      const results = await EvalResult.findManyByEvalId(evalId, { testIdx: 0 });
      expect(results).toHaveLength(1);
      expect(results[0].testIdx).toBe(0);
    });
  });

  describe('createManyFromEvaluateResult', () => {
    it('preserves trace linkage across bulk persistence', async () => {
      const [result] = await EvalResult.createManyFromEvaluateResult(
        [
          {
            ...mockEvaluateResult,
            traceId: 'bulk-trace-id',
            evaluationId: 'bulk-evaluation-id',
            metadata: { source: 'import' },
          },
        ],
        'test-eval-bulk-trace-linkage',
      );

      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'bulk-trace-id',
        evaluationId: 'bulk-evaluation-id',
        metadata: { source: 'import' },
      });
    });
  });

  describe('save', () => {
    it('should save new results', async () => {
      const result = new EvalResult({
        id: 'test-save-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      await result.save();
      expect(result.persisted).toBe(true);

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
    });

    it('should update existing results', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-id', mockEvaluateResult);
      const cacheKey = getStandaloneEvalCacheKey();
      setCachedStandaloneEvals(cacheKey, []);

      result.score = 0.5;
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.score).toBe(0.5);
      expect(getCachedStandaloneEvals(cacheKey)).toBeUndefined();
    });

    it('clears the standalone cache when a new result is inserted via save()', async () => {
      // persist:false yields an in-memory result, so save() takes the INSERT branch. This pins
      // the PR's headline behavior — incrementally-added results invalidate the standalone cache.
      const result = await EvalResult.createFromEvaluateResult('test-eval-id', mockEvaluateResult, {
        persist: false,
      });
      expect(result.persisted).toBe(false);

      const cacheKey = getStandaloneEvalCacheKey();
      setCachedStandaloneEvals(cacheKey, []);

      await result.save();

      expect(result.persisted).toBe(true);
      expect(getCachedStandaloneEvals(cacheKey)).toBeUndefined();
    });

    it('preserves trace linkage when save() updates an existing row', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-save-trace', {
        ...mockEvaluateResult,
        traceId: 'persisted-trace-id',
        evaluationId: 'persisted-evaluation-id',
        metadata: { source: 'pre-save' },
      });

      result.score = 0.42;
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        score: 0.42,
        traceId: 'persisted-trace-id',
        evaluationId: 'persisted-evaluation-id',
        metadata: { source: 'pre-save' },
      });
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
    });

    it('persists trace linkage on the save() INSERT branch', async () => {
      // persist:false yields an in-memory result, so the first save() takes the INSERT branch
      // (the UPDATE branch is covered above). This pins trace-linkage persistence on insert.
      const result = await EvalResult.createFromEvaluateResult(
        'test-eval-save-insert-trace',
        {
          ...mockEvaluateResult,
          traceId: 'insert-trace-id',
          evaluationId: 'insert-evaluation-id',
          metadata: { source: 'insert' },
        },
        { persist: false },
      );
      expect(result.persisted).toBe(false);

      await result.save();
      expect(result.persisted).toBe(true);

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        traceId: 'insert-trace-id',
        evaluationId: 'insert-evaluation-id',
        metadata: { source: 'insert' },
      });
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
    });

    it('strips the reserved namespace even when stored trace ids are malformed (non-string)', async () => {
      // Guards against a corrupted/hand-written row: malformed ids don't surface, but the
      // internal `__promptfoo` namespace must never leak back into user-visible metadata.
      const result = await EvalResult.createFromEvaluateResult('test-eval-malformed-linkage', {
        ...mockEvaluateResult,
        traceId: 123 as unknown as string,
        evaluationId: null as unknown as string,
        metadata: { source: 'malformed' },
      });

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult().traceId).toBeUndefined();
      expect(retrieved?.toEvaluateResult().evaluationId).toBeUndefined();
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
      expect(retrieved?.metadata).toEqual({ source: 'malformed' });
    });

    it('persists trace linkage mutated after construction', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-mutate-trace', {
        ...mockEvaluateResult,
        traceId: 'initial-trace',
        evaluationId: 'initial-evaluation',
      });

      result.traceId = 'updated-trace';
      result.evaluationId = 'updated-evaluation';
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.traceId).toBe('updated-trace');
      expect(retrieved?.evaluationId).toBe('updated-evaluation');
    });

    it('clears trace linkage when both fields are unset before save()', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-clear-trace', {
        ...mockEvaluateResult,
        traceId: 'about-to-clear',
        evaluationId: 'about-to-clear',
        metadata: { source: 'clear-test' },
      });

      result.traceId = undefined;
      result.evaluationId = undefined;
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.traceId).toBeUndefined();
      expect(retrieved?.evaluationId).toBeUndefined();
      expect(retrieved?.metadata).toEqual({ source: 'clear-test' });
    });

    it('save() is idempotent when called multiple times without changes', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-idempotent', {
        ...mockEvaluateResult,
        traceId: 'idempotent-trace',
        evaluationId: 'idempotent-evaluation',
        metadata: { source: 'idempotent' },
      });

      await result.save();
      await result.save();
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        traceId: 'idempotent-trace',
        evaluationId: 'idempotent-evaluation',
        metadata: { source: 'idempotent' },
      });
    });
  });

  describe('toEvaluateResult', () => {
    it('should convert EvalResult to EvaluateResult format', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-id', mockEvaluateResult);

      const evaluateResult = result.toEvaluateResult();

      // Only test the specific fields we care about
      expect(evaluateResult).toEqual(
        expect.objectContaining({
          promptIdx: mockEvaluateResult.promptIdx,
          testIdx: mockEvaluateResult.testIdx,
          prompt: mockEvaluateResult.prompt,
          success: mockEvaluateResult.success,
          score: mockEvaluateResult.score,
          provider: {
            id: mockProvider.id,
            label: mockProvider.label,
          },
        }),
      );
    });

    it('should preserve the original response object when response stripping is disabled', () => {
      const response = {
        output: 'provider output',
        metadata: {
          transformedRequest: {
            headers: {
              Authorization: 'Bearer nested-secret',
            },
          },
        },
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().response).toBe(response);
    });

    it('should count assertion requests when the grading provider omits token usage', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'ok',
        },
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage?.assertions).toMatchObject({
        numRequests: 1,
      });
    });

    it('does not invent grading requests when reconstructing deterministic assertions', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Deterministic assertion passed',
          tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
        },
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage?.assertions).toMatchObject({
        total: 0,
        numRequests: 0,
      });
    });

    it('separates logical and incurred requests when legacy grading results imply a cache hit', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Legacy cached grading result',
          tokensUsed: { total: 97, cached: 97, numRequests: 0 },
        },
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage).toMatchObject({
        assertions: { total: 97, cached: 97, numRequests: 1 },
        incurredTokenUsage: { assertions: { total: 0, numRequests: 0 } },
      });
    });

    it('counts a provider request for a response that reports no token usage', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: { output: 'hello' },
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage?.numRequests).toBe(1);
    });

    it('should strip nested provider response metadata when metadata stripping is enabled', () => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_METADATA: 'true' });

      try {
        const result = new EvalResult({
          id: 'test-id',
          evalId: 'test-eval-id',
          promptIdx: 0,
          testIdx: 0,
          testCase: mockTestCase,
          prompt: mockPrompt,
          success: true,
          score: 1,
          response: {
            output: 'provider output',
            latencyMs: 42,
            metadata: {
              transformedRequest: {
                headers: {
                  Authorization: 'Bearer nested-secret',
                },
              },
            },
          },
          gradingResult: null,
          provider: mockProvider,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          metadata: {
            debug: 'top-level-secret',
          },
        });

        const evaluateResult = result.toEvaluateResult();

        expect(evaluateResult.metadata).toEqual({});
        expect(evaluateResult.response).toEqual({
          output: 'provider output',
          latencyMs: 42,
        });
        expect(JSON.stringify(evaluateResult)).not.toContain('nested-secret');
      } finally {
        restoreEnv();
      }
    });

    it('should strip nested test-case metadata when metadata stripping is enabled', () => {
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_STRIP_METADATA: 'true',
        PROMPTFOO_STRIP_TEST_VARS: 'true',
      });

      try {
        const result = new EvalResult({
          id: 'test-id',
          evalId: 'test-eval-id',
          promptIdx: 0,
          testIdx: 0,
          testCase: {
            ...mockTestCase,
            vars: {
              customerEmail: 'secret@example.com',
            },
            metadata: {
              goal: 'goal testcase-secret',
              pluginConfig: {
                policy: 'policy testcase-secret',
              },
              inputMaterialization: {
                source: 'source testcase-secret',
              },
            },
          },
          prompt: mockPrompt,
          success: true,
          score: 1,
          response: {
            output: 'provider output',
          },
          gradingResult: null,
          provider: mockProvider,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          metadata: {
            debug: 'top-level-secret',
          },
        });

        const evaluateResult = result.toEvaluateResult();

        expect(evaluateResult.metadata).toEqual({});
        expect(evaluateResult.testCase).not.toHaveProperty('metadata');
        expect(evaluateResult.testCase.vars).toBeUndefined();
        expect(JSON.stringify(evaluateResult)).not.toContain('testcase-secret');
      } finally {
        restoreEnv();
      }
    });
  });

  describe('pluginId', () => {
    it('should set pluginId from testCase metadata', () => {
      const testCaseWithPluginId: AtomicTestCase = {
        ...mockTestCase,
        metadata: {
          pluginId: 'test-plugin-123',
        },
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: testCaseWithPluginId,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.pluginId).toBe('test-plugin-123');
    });

    it('should set pluginId to undefined when metadata is missing', () => {
      const testCaseWithoutMetadata: AtomicTestCase = {
        ...mockTestCase,
        metadata: undefined,
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: testCaseWithoutMetadata,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.pluginId).toBeUndefined();
    });

    it('should set pluginId to undefined when pluginId is not in metadata', () => {
      const testCaseWithOtherMetadata: AtomicTestCase = {
        ...mockTestCase,
        metadata: {
          otherField: 'value',
        },
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: testCaseWithOtherMetadata,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.pluginId).toBeUndefined();
    });

    it('should preserve pluginId when created from EvaluateResult', async () => {
      const testCaseWithPluginId: AtomicTestCase = {
        ...mockTestCase,
        metadata: {
          pluginId: 'eval-result-plugin',
        },
      };

      const evaluateResultWithPlugin: EvaluateResult = {
        ...mockEvaluateResult,
        testCase: testCaseWithPluginId,
      };

      const result = await EvalResult.createFromEvaluateResult(
        'test-eval-id',
        evaluateResultWithPlugin,
        { persist: false },
      );

      expect(result.pluginId).toBe('eval-result-plugin');
    });
  });

  describe('getCompletedIndexPairs', () => {
    it('should return all completed pairs by default', async () => {
      const evalId = 'test-completed-pairs-all';

      // Create results with different failure reasons
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 2,
        promptIdx: 0,
        failureReason: ResultFailureReason.ASSERT,
      });

      const pairs = await EvalResult.getCompletedIndexPairs(evalId);

      expect(pairs.size).toBe(3);
      expect(pairs.has('0:0')).toBe(true);
      expect(pairs.has('1:0')).toBe(true);
      expect(pairs.has('2:0')).toBe(true);
    });

    it('should exclude ERROR results when excludeErrors is true', async () => {
      const evalId = 'test-completed-pairs-exclude';

      // Create results with different failure reasons
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 2,
        promptIdx: 0,
        failureReason: ResultFailureReason.ASSERT,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 3,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      const pairs = await EvalResult.getCompletedIndexPairs(evalId, { excludeErrors: true });

      // Should only include non-ERROR results
      expect(pairs.size).toBe(2);
      expect(pairs.has('0:0')).toBe(true);
      expect(pairs.has('1:0')).toBe(false); // ERROR - excluded
      expect(pairs.has('2:0')).toBe(true);
      expect(pairs.has('3:0')).toBe(false); // ERROR - excluded
    });

    it('should include ERROR results when excludeErrors is false', async () => {
      const evalId = 'test-completed-pairs-include';

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      const pairsExclude = await EvalResult.getCompletedIndexPairs(evalId, {
        excludeErrors: false,
      });
      expect(pairsExclude.size).toBe(1);
      expect(pairsExclude.has('0:0')).toBe(true);
    });

    it('should return empty set for non-existent eval', async () => {
      const pairs = await EvalResult.getCompletedIndexPairs('non-existent-eval-id');
      expect(pairs.size).toBe(0);
    });

    it('should handle multiple prompts correctly', async () => {
      const evalId = 'test-completed-pairs-multi-prompt';

      // Create results with different promptIdx
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 1,
        failureReason: ResultFailureReason.ERROR,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      const pairsAll = await EvalResult.getCompletedIndexPairs(evalId);
      expect(pairsAll.size).toBe(3);
      expect(pairsAll.has('0:0')).toBe(true);
      expect(pairsAll.has('0:1')).toBe(true);
      expect(pairsAll.has('1:0')).toBe(true);

      const pairsExcludeErrors = await EvalResult.getCompletedIndexPairs(evalId, {
        excludeErrors: true,
      });
      expect(pairsExcludeErrors.size).toBe(2);
      expect(pairsExcludeErrors.has('0:0')).toBe(true);
      expect(pairsExcludeErrors.has('0:1')).toBe(false); // ERROR - excluded
      expect(pairsExcludeErrors.has('1:0')).toBe(true);
    });
  });
});
