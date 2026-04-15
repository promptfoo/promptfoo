import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../../src/models/eval';
import EvalResult from '../../../src/models/evalResult';
import { createApp } from '../../../src/server/server';
import { DEFAULT_OVERSIZED_STRING_LIMIT } from '../../../src/server/utils/safeJsonResponse';
import { ResultFailureReason } from '../../../src/types';

describe('GET /api/eval/:id/table large payload handling', () => {
  let app: ReturnType<typeof createApp>;

  const oversized = 'x'.repeat(DEFAULT_OVERSIZED_STRING_LIMIT + 1);
  const normal = 'normal cell';

  beforeEach(() => {
    app = createApp();

    vi.spyOn(Eval, 'findById').mockResolvedValue({
      id: 'large-eval',
      config: {
        description: 'large eval config',
        prompts: ['prompt {{image}}'],
        tests: [{ vars: { image: oversized } }],
        defaultTest: { vars: { image: oversized } },
      },
      author: null,
      version: () => 4,
      getStats: () => ({
        successes: 1,
        failures: 0,
        errors: 0,
        tokenUsage: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 0,
          completionDetails: {
            reasoning: 0,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
          assertions: {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            numRequests: 0,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
          },
        },
      }),
      getTablePage: vi.fn().mockResolvedValue({
        head: {
          prompts: [{ raw: oversized, label: 'large prompt', provider: 'test-provider' }],
          vars: ['image'],
        },
        body: [
          {
            outputs: [
              {
                evalId: 'large-eval',
                id: 'output-1',
                text: oversized,
                prompt: oversized,
                provider: 'test-provider',
                pass: true,
                score: 1,
                namedScores: {},
                cost: 0,
                latencyMs: 0,
                failureReason: ResultFailureReason.NONE,
                metadata: {
                  comment: 'keep this',
                  inputVars: { image: oversized },
                },
                response: {
                  cached: false,
                  output: oversized,
                  prompt: oversized,
                  tokenUsage: { total: 1, prompt: 1, completion: 0 },
                  images: [{ data: oversized, mimeType: 'image/png' }],
                },
                images: [{ data: oversized, mimeType: 'image/png' }],
              },
            ],
            vars: [oversized],
            test: { vars: { image: oversized } },
            testIdx: 0,
          },
          {
            outputs: [
              {
                evalId: 'large-eval',
                id: 'output-2',
                text: normal,
                prompt: 'small prompt',
                provider: 'test-provider',
                pass: true,
                score: 1,
                namedScores: {},
                cost: 0,
                latencyMs: 0,
                failureReason: ResultFailureReason.NONE,
              },
            ],
            vars: [normal],
            test: { vars: { image: normal } },
            testIdx: 1,
          },
        ],
        totalCount: 2,
        filteredCount: 2,
        id: 'large-eval',
      }),
    } as unknown as Eval);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockNextPayloadStringifyRangeError(
    shouldThrowForValue: (value: unknown) => boolean,
  ): void {
    const originalStringify = JSON.stringify;
    let didThrow = false;

    vi.spyOn(JSON, 'stringify').mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const [value] = args;
      if (!didThrow && shouldThrowForValue(value)) {
        didThrow = true;
        throw new RangeError('Invalid string length');
      }
      return originalStringify(...args);
    });
  }

  it('returns a lean table payload without waiting for JSON serialization to overflow', async () => {
    const response = await request(app).get('/api/eval/large-eval/table');

    expect(response.status).toBe(200);
    expect(response.headers['x-promptfoo-response-truncated']).toBeUndefined();
    expect(response.body.table.body).toHaveLength(2);

    const placeholder = `[content omitted: ${oversized.length} characters]`;
    const largeCell = response.body.table.body[0].outputs[0];
    expect(response.body.table.head.prompts[0].raw).toBe(placeholder);
    expect(response.body.table.body[0].vars[0]).toBe(placeholder);
    expect(response.body.table.body[0].test.vars).toBeUndefined();
    expect(response.body.table.body[0].testIdx).toBe(0);
    expect(response.body.config).toEqual({
      description: 'large eval config',
      prompts: ['prompt {{image}}'],
    });
    expect(response.body.configDetail).toEqual({
      available: true,
      omittedFields: ['tests', 'defaultTest'],
    });
    expect(largeCell.prompt).toBe('');
    expect(largeCell.text).toBe(placeholder);
    expect(largeCell.response.output).toBeUndefined();
    expect(largeCell.response.prompt).toBeUndefined();
    expect(largeCell.response.images[0].data).toBeUndefined();
    expect(largeCell.metadata).toEqual({ comment: 'keep this' });
    expect(largeCell.testCase.vars).toBeUndefined();
    expect(largeCell.detail).toEqual({
      available: true,
      omittedFields: ['prompt', 'response', 'testCase', 'metadata', 'media'],
    });

    const normalCell = response.body.table.body[1].outputs[0];
    expect(normalCell.prompt).toBe('');
    expect(normalCell.text).toBe(normal);
    expect(normalCell.detail).toEqual({
      available: true,
      omittedFields: ['prompt', 'response', 'testCase', 'metadata'],
    });
  });

  it('strips oversized table strings and preserves table shape when JSON serialization overflows', async () => {
    mockNextPayloadStringifyRangeError(
      (value) => value !== null && typeof value === 'object' && 'table' in value,
    );

    const response = await request(app).get('/api/eval/large-eval/table');

    expect(response.status).toBe(200);
    expect(response.headers['x-promptfoo-response-truncated']).toBe('true');
    expect(Number(response.headers['x-promptfoo-truncated-fields'])).toBeGreaterThanOrEqual(0);
    expect(response.body.table.body).toHaveLength(2);
    expect(response.body.table.body[1].outputs[0].text).toBe(normal);

    const placeholder = `[content omitted: ${oversized.length} characters]`;
    expect(response.body.table.head.prompts[0].raw).toBe(placeholder);
    expect(response.body.table.body[0].outputs[0].text).toBe(placeholder);
    expect(response.body.table.body[0].outputs[0].prompt).toBe('');
    expect(response.body.table.body[0].outputs[0].detail).toEqual({
      available: true,
      omittedFields: ['prompt', 'response', 'testCase', 'metadata', 'media'],
    });
    expect(response.body.table.body[0].outputs[0].metadata).toEqual({ comment: 'keep this' });
    expect(response.body.table.body[0].outputs[0].metadata.inputVars).toBeUndefined();
    expect(response.body.table.body[0].outputs[0].images[0].data).toBeUndefined();
    expect(response.body.table.body[0].vars[0]).toBe(placeholder);
    expect(response.body.table.body[0].test.vars).toBeUndefined();
  });

  it('returns full result detail from the detail endpoint', async () => {
    vi.spyOn(EvalResult, 'findById').mockResolvedValue({
      id: 'output-1',
      evalId: 'large-eval',
      promptIdx: 0,
      testIdx: 0,
      prompt: { raw: oversized, label: 'large prompt' },
      response: {
        output: oversized,
        prompt: oversized,
        images: [{ data: oversized, mimeType: 'image/png' }],
      },
      testCase: { vars: { image: oversized } },
      provider: { id: 'test-provider' },
      success: true,
      score: 1,
      cost: 0,
      latencyMs: 0,
      namedScores: {},
      metadata: { inputVars: { image: oversized } },
      failureReason: ResultFailureReason.NONE,
    } as unknown as EvalResult);

    const response = await request(app).get('/api/eval/large-eval/results/output-1/detail');

    expect(response.status).toBe(200);
    expect(response.body.prompt).toBe(oversized);
    expect(response.body.response.output).toBe(oversized);
    expect(response.body.response.images[0].data).toBe(oversized);
    expect(response.body.testCase.vars.image).toBe(oversized);
    expect(response.body.metadata.inputVars.image).toBe(oversized);
  });

  it('returns full config from the config detail endpoint', async () => {
    const response = await request(app).get('/api/eval/large-eval/config');

    expect(response.status).toBe(200);
    expect(response.body.config.tests[0].vars.image).toBe(oversized);
    expect(response.body.config.defaultTest.vars.image).toBe(oversized);
  });

  it('enforces eval ownership on the detail endpoint', async () => {
    vi.spyOn(EvalResult, 'findById').mockResolvedValue({
      id: 'output-1',
      evalId: 'other-eval',
    } as unknown as EvalResult);

    const response = await request(app).get('/api/eval/large-eval/results/output-1/detail');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Result not found' });
  });

  it('returns a generic 500 when the detail endpoint lookup fails', async () => {
    vi.spyOn(EvalResult, 'findById').mockRejectedValue(new Error('database unavailable'));

    const response = await request(app).get('/api/eval/large-eval/results/output-1/detail');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch result detail' });
  });

  it('returns 413 for oversized JSON exports instead of sending a broken attachment response', async () => {
    mockNextPayloadStringifyRangeError(
      (value) =>
        value !== null &&
        typeof value === 'object' &&
        'head' in value &&
        'body' in value &&
        !('table' in value),
    );

    const response = await request(app).get('/api/eval/large-eval/table?format=json');

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'Eval JSON export is too large to serialize' });
    expect(response.headers['content-disposition']).toBeUndefined();
  });
});
