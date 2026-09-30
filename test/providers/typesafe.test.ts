import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { matchesClassification } from '../../src/matchers/classification';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { getTypeSafeCacheKey, TypeSafeProvider } from '../../src/providers/typesafe';
import { HttpRateLimitError } from '../../src/util/fetch/errors';
import { withFetchRetryContext } from '../../src/util/fetch/retryContext';
import { mockProcessEnv } from '../util/utils';

import type { TypeSafeConfig } from '../../src/providers/typesafe';
import type { CallApiContextParams } from '../../src/types/providers';

vi.mock('../../src/cache');

const mockedFetchWithCache = vi.mocked(fetchWithCache);

const API_KEY = 'ts-test-secret-key';
const API_URL = 'https://api.typesafe.ai/v1/systemone';
const LEVELS = ['Calm', 'Frustrated', 'Very angry'];

function mockResponse(
  data: unknown,
  {
    status = 200,
    statusText = 'OK',
    cached = false,
    headers = {},
    coalesced = false,
  }: {
    status?: number;
    statusText?: string;
    cached?: boolean;
    headers?: Record<string, string>;
    coalesced?: boolean;
  } = {},
) {
  return {
    data: JSON.stringify(data),
    cached,
    coalesced,
    status,
    statusText,
    headers,
    latencyMs: 12,
    deleteFromCache: vi.fn(),
  };
}

function jevResponse(answer: Record<string, unknown>, questionId = 'grade') {
  return {
    model: 'jev-1.13.0',
    answers: { [questionId]: answer },
    usage: { input_tokens: 296, output_tokens: 20 },
  };
}

function rubricContext(rubric: unknown, output: unknown): CallApiContextParams {
  return {
    prompt: { raw: 'rendered grading prompt', label: 'llm-rubric' },
    vars: { rubric, output } as CallApiContextParams['vars'],
  };
}

function createProvider(config: TypeSafeConfig = {}) {
  return new TypeSafeProvider('jev-latest', {
    config: { apiKey: API_KEY, cacheNamespace: 'fixture-account', ...config },
  });
}

function lastRequest() {
  const call = mockedFetchWithCache.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetchWithCache was not called');
  }
  const [url, options, , format, cacheOptions] = call;
  return {
    url,
    options,
    format,
    cacheOptions: cacheOptions as { bust?: boolean; cacheKey?: string },
    body: JSON.parse(options?.body as string),
  };
}

describe('TypeSafeProvider', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    mockedFetchWithCache.mockReset();
    restoreEnv = mockProcessEnv({ TYPESAFE_API_KEY: undefined });
  });

  afterEach(() => {
    restoreEnv();
    vi.resetAllMocks();
  });

  describe('construction', () => {
    it('uses the typesafe:<model> id and supports a custom id', () => {
      expect(createProvider().id()).toBe('typesafe:jev-latest');
      expect(createProvider().toString()).toBe('[TypeSafe Provider jev-latest]');
      expect(new TypeSafeProvider('jev-1.13.0').id()).toBe('typesafe:jev-1.13.0');
      expect(new TypeSafeProvider('jev-latest', { id: 'my-judge' }).id()).toBe('my-judge');
    });

    it('resolves the API key from config, then env overrides, then the environment', () => {
      restoreEnv();
      restoreEnv = mockProcessEnv({ TYPESAFE_API_KEY: 'process-key' });

      expect(
        new TypeSafeProvider('jev-latest', {
          config: { apiKey: 'config-key' },
          env: { TYPESAFE_API_KEY: 'override-key' },
        }).getApiKey(),
      ).toBe('config-key');
      expect(
        new TypeSafeProvider('jev-latest', {
          env: { TYPESAFE_API_KEY: 'override-key' },
        }).getApiKey(),
      ).toBe('override-key');
      expect(new TypeSafeProvider('jev-latest').getApiKey()).toBe('process-key');
    });

    it('keeps the API key out of the stored config', () => {
      const provider = createProvider({ threshold: 0.7 });
      expect(provider.config).toEqual({ cacheNamespace: 'fixture-account', threshold: 0.7 });
      expect(JSON.stringify(provider.config)).not.toContain(API_KEY);
      expect(provider.requiresApiKey()).toBe(true);
    });
  });

  describe('callApi as an llm-rubric grader', () => {
    it('sends the rubric as a Noul question about the graded output', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'noul', noul: 0.93 })),
      );

      await createProvider().callApi(
        'rendered grading prompt',
        rubricContext('Content contains a greeting', 'Hello world'),
      );

      const request = lastRequest();
      expect(request.url).toBe(API_URL);
      expect(request.options).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      });
      expect(request.format).toBe('text');
      expect(request.body).toEqual({
        state: 'Hello world',
        model: 'jev-latest',
        questions: { grade: { type: 'noul', instructions: 'Content contains a greeting' } },
      });
      expect(request.cacheOptions.cacheKey).toMatch(/^typesafe:v3:jev-latest:[0-9a-f]{64}$/);
      expect(request.cacheOptions.cacheKey).not.toContain(API_KEY);
    });

    it('keeps structured rubrics and outputs structured', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'noul', noul: 0.8 })),
      );
      const rubric = { question: 'Does `answer` cite a source?' };
      const output = { answer: 'Paris', sources: ['wikipedia'] };

      await createProvider().callApi('rendered grading prompt', rubricContext(rubric, output));

      expect(lastRequest().body).toMatchObject({
        state: output,
        questions: { grade: { type: 'noul', instructions: rubric } },
      });
    });

    it.each([
      { noul: 0.93, threshold: undefined, pass: true, comparator: '>=', expected: 0.5 },
      { noul: 0.5, threshold: undefined, pass: true, comparator: '>=', expected: 0.5 },
      { noul: 0.49, threshold: undefined, pass: false, comparator: '<', expected: 0.5 },
      { noul: 0.93, threshold: 0.95, pass: false, comparator: '<', expected: 0.95 },
      { noul: 0.2, threshold: 0.1, pass: true, comparator: '>=', expected: 0.1 },
    ])(
      'Noul p=$noul with threshold $threshold passes=$pass',
      async ({ noul, threshold, pass, comparator, expected }) => {
        mockedFetchWithCache.mockResolvedValue(mockResponse(jevResponse({ type: 'noul', noul })));

        const result = await createProvider({ threshold }).callApi(
          'rendered grading prompt',
          rubricContext('Is polite', 'Thanks!'),
        );

        expect(result.error).toBeUndefined();
        expect(JSON.parse(result.output)).toEqual({
          pass,
          score: noul,
          reason: `Derived from Jev Noul p=${noul} ${comparator} threshold ${expected}`,
        });
      },
    );

    it('keeps the raw Jev decision in metadata and labels the reason as derived', async () => {
      const answer = { type: 'noul', noul: 0.93 };
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse(answer), { headers: { 'x-typesafe-request-id': 'req_123' } }),
      );

      const result = await createProvider().callApi(
        'rendered grading prompt',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(JSON.parse(result.output).reason).toMatch(/^Derived from Jev Noul /);
      expect(result.metadata).toEqual({
        typesafe: {
          model: 'jev-1.13.0',
          questionType: 'noul',
          answer,
          threshold: 0.5,
          estimatedCost: expect.any(Number),
          requestId: 'req_123',
        },
      });
      expect(result.tokenUsage).toEqual({
        total: 316,
        prompt: 296,
        completion: 20,
        numRequests: 1,
      });
      expect(result.latencyMs).toBe(12);
      expect(result.cached).toBe(false);
    });

    it('uses a Score question and normalizes the unrounded score when levels are configured', async () => {
      const answer = {
        type: 'score',
        score: 1.43,
        legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
        probabilities: { '0': 0, '1': 0.57, '2': 0.43 },
        confidence: 0.35,
      };
      mockedFetchWithCache.mockResolvedValue(mockResponse(jevResponse(answer)));

      const result = await createProvider({ levels: LEVELS }).callApi(
        'rendered grading prompt',
        rubricContext('How frustrated is the customer?', 'This is the third time I am writing'),
      );

      expect(lastRequest().body.questions).toEqual({
        grade: { type: 'score', instructions: 'How frustrated is the customer?', criteria: LEVELS },
      });
      expect(JSON.parse(result.output)).toEqual({
        pass: true,
        score: 0.715,
        reason:
          'Derived from Jev Score 1.43 on levels 0–2 (normalized 0.715 >= threshold 0.5); nearest level 1: "Frustrated"',
      });
      expect(result.metadata?.typesafe).toMatchObject({ questionType: 'score', answer });
    });

    it.each([
      { score: 0, expected: 0, pass: false },
      { score: 2, expected: 1, pass: true },
      { score: 0.9, expected: 0.45, pass: false },
    ])(
      'normalizes Score $score on three levels to $expected',
      async ({ score, expected, pass }) => {
        mockedFetchWithCache.mockResolvedValue(mockResponse(jevResponse({ type: 'score', score })));

        const result = await createProvider({ levels: LEVELS }).callApi(
          'rendered grading prompt',
          rubricContext('How frustrated is the customer?', 'ok'),
        );

        expect(JSON.parse(result.output)).toMatchObject({ pass, score: expected });
      },
    );

    it('falls back to the configured level text when the legend is missing', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'score', score: 1.8 })),
      );

      const result = await createProvider({ levels: LEVELS }).callApi(
        'rendered grading prompt',
        rubricContext('How frustrated is the customer?', 'ok'),
      );

      expect(JSON.parse(result.output).reason).toContain('nearest level 2: "Very angry"');
    });

    it('passes bustCache through to the fetch cache', async () => {
      mockedFetchWithCache.mockResolvedValue(mockResponse(jevResponse({ type: 'noul', noul: 1 })));

      await createProvider().callApi('rendered grading prompt', {
        ...rubricContext('Is polite', 'Thanks!'),
        bustCache: true,
      });

      expect(lastRequest().cacheOptions.bust).toBe(true);
    });

    it('reports cached responses without counting a new request', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'noul', noul: 0.7 }), { cached: true }),
      );

      const result = await createProvider().callApi(
        'rendered grading prompt',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.cached).toBe(true);
      expect(result.tokenUsage).toEqual({ cached: 316, total: 316 });
    });

    it.each([
      { providerThreshold: undefined, assertionThreshold: 0.3, score: 0.4, pass: false },
      { providerThreshold: 0.3, assertionThreshold: 0.5, score: 0.4, pass: false },
      { providerThreshold: 0.3, assertionThreshold: 0.3, score: 0.4, pass: true },
      { providerThreshold: 0.7, assertionThreshold: 0.5, score: 0.7, pass: true },
    ])(
      'requires both provider and assertion thresholds: %j',
      async ({ providerThreshold, assertionThreshold, score, pass }) => {
        mockedFetchWithCache.mockResolvedValue(
          mockResponse(jevResponse({ type: 'noul', noul: score })),
        );
        const result = await matchesLlmRubric(
          'Is polite',
          'Thanks!',
          {
            provider: createProvider({ threshold: providerThreshold }),
          },
          undefined,
          { type: 'llm-rubric', value: 'Is polite', threshold: assertionThreshold },
        );
        expect(result).toMatchObject({ pass, score });
      },
    );

    it.each([
      { cached: false, coalesced: false, expectedCost: 296 * (0.042 / 1_000_000) },
      { cached: true, coalesced: false, expectedCost: 0 },
      { cached: false, coalesced: true, expectedCost: 0 },
    ])(
      'tracks published input cost and avoids duplicate billing: %j',
      async ({ cached, coalesced, expectedCost }) => {
        mockedFetchWithCache.mockResolvedValue(
          mockResponse(jevResponse({ type: 'noul', noul: 0.9 }), { cached, coalesced }),
        );
        const result = await createProvider({ instructions: 'Is polite?' }).callApi('Thanks!');
        expect(result.cost).toBeCloseTo(expectedCost, 12);
        expect(result.metadata?.typesafe.estimatedCost).toBe(result.cost);
        expect(result.cached).toBe(cached || coalesced);
        expect(result.tokenUsage).toEqual(
          cached || coalesced
            ? { cached: 316, total: 316 }
            : { prompt: 296, completion: 20, total: 316, numRequests: 1 },
        );
      },
    );

    it.each([
      { model: 'future-model', usage: { input_tokens: 296 } },
      { model: undefined, usage: { input_tokens: 296 } },
      { model: 'jev-1.13.0', usage: undefined },
      { model: 'jev-1.13.0', usage: { input_tokens: -1 } },
      { model: 'jev-1.13.0', usage: { input_tokens: '296' } },
    ])('omits estimates for unknown prices or invalid usage: %j', async (overrides) => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse({ ...jevResponse({ type: 'noul', noul: 0.9 }), ...overrides }),
      );
      const result = await createProvider({ instructions: 'Is polite?' }).callApi('Thanks!');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeUndefined();
      expect(result.metadata?.typesafe).not.toHaveProperty('estimatedCost');
    });

    it('uses a pinned model price if the response does not include its version', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse({
          answers: { grade: { type: 'noul', noul: 1 } },
          usage: { input_tokens: 1_000_000 },
        }),
      );
      const result = await new TypeSafeProvider('jev-1.13.0', {
        config: { apiKey: API_KEY, instructions: 'Is polite?' },
      }).callApi('Thanks!');
      expect(result.cost).toBe(0.042);
      expect(result.tokenUsage).toMatchObject({
        prompt: 1_000_000,
        completion: 0,
        total: 1_000_000,
      });
    });

    it('does not report negative token counts', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse({
          ...jevResponse({ type: 'noul', noul: 1 }),
          usage: { input_tokens: -1, output_tokens: -10 },
        }),
      );
      const result = await createProvider({ instructions: 'Is polite?' }).callApi('Thanks!');
      expect(result.tokenUsage).toEqual({ prompt: 0, completion: 0, total: 0, numRequests: 1 });
    });

    it('works end to end through matchesLlmRubric', async () => {
      const answer = { type: 'noul', noul: 0.12 };
      mockedFetchWithCache.mockResolvedValue(mockResponse(jevResponse(answer)));

      const result = await matchesLlmRubric('Speaks like a pirate', 'Good morning, sir.', {
        provider: createProvider(),
      });

      expect(lastRequest().body).toMatchObject({
        state: 'Good morning, sir.',
        questions: { grade: { type: 'noul', instructions: 'Speaks like a pirate' } },
      });
      expect(result).toMatchObject({
        pass: false,
        score: 0.12,
        reason: 'Derived from Jev Noul p=0.12 < threshold 0.5',
      });
      expect(result.metadata?.typesafe).toMatchObject({ model: 'jev-1.13.0', answer });
    });
  });

  describe('callApi outside llm-rubric', () => {
    it('uses the prompt as state and the configured instructions as the question', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'noul', noul: 0.95 })),
      );

      const result = await createProvider({ instructions: 'Does this convey urgency?' }).callApi(
        'Help! My payouts have been failing for 3 days.',
      );

      expect(lastRequest().body).toEqual({
        state: 'Help! My payouts have been failing for 3 days.',
        model: 'jev-latest',
        questions: { grade: { type: 'noul', instructions: 'Does this convey urgency?' } },
      });
      expect(JSON.parse(result.output).pass).toBe(true);
    });

    it('ignores rubric-shaped vars that do not come from llm-rubric', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'noul', noul: 0.4 })),
      );

      await createProvider({ instructions: 'Is this a question?' }).callApi('What time is it?', {
        prompt: { raw: 'What time is it?', label: 'my prompt' },
        vars: { rubric: 'unrelated test var', output: 'x' },
      });

      expect(lastRequest().body).toMatchObject({
        state: 'What time is it?',
        questions: { grade: { instructions: 'Is this a question?' } },
      });
    });

    it('preserves structured instructions and Score levels', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'score', score: 1 })),
      );
      const instructions = { question: 'How polite is this?' };
      const levels = [{ description: 'Rude' }, ['Polite', 'Friendly']];
      const result = await createProvider({ instructions, levels }).callApi('Thanks!');
      expect(result.error).toBeUndefined();
      expect(lastRequest().body.questions.grade).toEqual({
        type: 'score',
        instructions,
        criteria: levels,
      });
    });

    it.each([null, 1, false])(
      'rejects unsupported instruction entries: %j',
      async (instructions) => {
        const result = await createProvider({ instructions } as unknown as TypeSafeConfig).callApi(
          'Thanks!',
        );
        expect(result.error).toMatch(/needs a question/);
        expect(mockedFetchWithCache).not.toHaveBeenCalled();
      },
    );

    it('errors without a question and does not call the API', async () => {
      const result = await createProvider().callApi('Some text');

      expect(result.error).toMatch(/needs a question.*`instructions`/);
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('cache key', () => {
    const base = {
      state: 'Help! My payouts have been failing for 3 days.',
      model: 'jev-latest',
      questions: {
        department: {
          type: 'choice' as const,
          instructions: 'Which team should handle this?',
          criteria: { billing: null, technical: null, sales: null },
        },
      },
    };
    const key = (request: typeof base | Record<string, any>) =>
      getTypeSafeCacheKey('https://api.typesafe.ai', request as typeof base, 'fixture-account');

    it('is stable for identical requests', () => {
      expect(key(base)).toBe(key(structuredClone(base)));
    });

    it('changes when the candidate labels change', () => {
      const changed = structuredClone(base) as Record<string, any>;
      changed.questions.department.criteria = { billing: null, technical: null, legal: null };
      expect(key(changed)).not.toBe(key(base));
    });

    it('changes when the label order changes', () => {
      const reordered = structuredClone(base) as Record<string, any>;
      reordered.questions.department.criteria = { sales: null, billing: null, technical: null };
      expect(key(reordered)).not.toBe(key(base));
    });

    it('preserves the serialized order of structured state entries', () => {
      expect(key({ ...base, state: { question: 'Refund?', answer: 'Yes' } })).not.toBe(
        key({ ...base, state: { answer: 'Yes', question: 'Refund?' } }),
      );
    });

    it('changes when a label description changes', () => {
      const described = structuredClone(base) as Record<string, any>;
      described.questions.department.criteria.billing = 'Payments, invoicing, refunds';
      expect(key(described)).not.toBe(key(base));
    });

    it('changes when Score levels are reordered', () => {
      const score = (criteria: string[]) => ({
        ...base,
        questions: { grade: { type: 'score', instructions: 'How frustrated?', criteria } },
      });
      expect(key(score(['Calm', 'Angry']))).not.toBe(key(score(['Angry', 'Calm'])));
    });

    it('changes with the question type, instructions, state, model and base URL', () => {
      const noul = {
        ...base,
        questions: { department: { type: 'noul', instructions: 'Which team should handle this?' } },
      };
      const variants = [
        key(base),
        key(noul),
        key({
          ...base,
          questions: { department: { ...base.questions.department, instructions: 'Who?' } },
        }),
        key({ ...base, state: 'Different state' }),
        key({ ...base, model: 'jev-1.13.0' }),
        getTypeSafeCacheKey('https://proxy.example.com', base, 'fixture-account'),
        getTypeSafeCacheKey('https://api.typesafe.ai', base, 'different-account'),
      ];
      expect(new Set(variants).size).toBe(variants.length);
    });

    it('varies with grading levels but reuses raw responses across local thresholds', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'score', score: 1 })),
      );
      const context = rubricContext('How frustrated is the customer?', 'ok');

      await createProvider({ levels: ['Calm', 'Frustrated', 'Very angry'] }).callApi('p', context);
      const first = lastRequest().cacheOptions.cacheKey;
      await createProvider({ levels: ['Very angry', 'Frustrated', 'Calm'] }).callApi('p', context);
      const second = lastRequest().cacheOptions.cacheKey;
      await createProvider({
        levels: ['Calm', 'Frustrated', 'Very angry'],
        threshold: 0.8,
      }).callApi('p', context);
      const third = lastRequest().cacheOptions.cacheKey;

      expect(first).not.toBe(second);
      expect(third).toBe(first);
    });

    it.each(['callApi', 'callClassificationApi'] as const)(
      'bypasses response caching and coalescing for %s without a namespace',
      async (method) => {
        mockedFetchWithCache.mockResolvedValue(
          mockResponse(jevResponse({ type: 'noul', noul: 1 })),
        );
        await createProvider({
          cacheNamespace: undefined,
          instructions: 'Is polite?',
          labels: ['polite', 'rude'],
        })[method]('text');

        expect(lastRequest().cacheOptions).toEqual({ bust: true });
      },
    );

    it.each(['', '  ', null, 3])(
      'rejects an invalid cache namespace: %j',
      async (cacheNamespace) => {
        const provider = createProvider({
          cacheNamespace,
          instructions: 'Is polite?',
        } as TypeSafeConfig);
        const result = await provider.callApi('text');

        expect(result.error).toContain(
          '`cacheNamespace` must be a non-empty, non-secret account identifier',
        );
        expect(mockedFetchWithCache).not.toHaveBeenCalled();
      },
    );
  });

  describe('errors', () => {
    it('errors when the API key is missing', async () => {
      const provider = new TypeSafeProvider('jev-latest', {
        config: { instructions: 'Is this urgent?' },
      });

      const result = await provider.callApi('text');

      expect(result.error).toContain('TypeSafe API key is not set');
      expect(result.error).toContain('TYPESAFE_API_KEY');
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it('formats HTTP errors with the status, request id and body, without the API key', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          { detail: 'Invalid API key' },
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: { 'x-typesafe-request-id': 'req_401' },
          },
        ),
      );

      const result = await createProvider().callApi(
        'rendered grading prompt',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.error).toContain('TypeSafe API error: 401 Unauthorized (request id req_401).');
      expect(result.error).toContain('Check TYPESAFE_API_KEY');
      expect(result.error).toContain('Invalid API key');
      expect(result.error).not.toContain(API_KEY);
    });

    it.each([
      [422, 'Unprocessable Entity', 'failed validation'],
      [429, 'Too Many Requests', 'Rate limit exceeded'],
      [529, 'Overloaded', 'overloaded'],
      [500, 'Internal Server Error', 'TypeSafe API error: 500'],
    ])('reports HTTP %s', async (status, statusText, message) => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse('upstream said no', { status, statusText }),
      );

      const result = await createProvider().callApi(
        'rendered grading prompt',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.error).toContain(message);
      expect(result.error).toContain('upstream said no');
    });

    it.each([false, true])(
      'preserves exhausted rate-limit details and quota semantics (quota=%s)',
      async (quota) => {
        mockedFetchWithCache.mockRejectedValue(
          new HttpRateLimitError({
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'x-typesafe-request-id': 'req_exhausted' },
            body: { detail: 'Capacity exceeded', apiKey: API_KEY },
            ...(quota ? { code: 'credit_balance_exhausted' } : {}),
          }),
        );
        const result = await createProvider({ instructions: 'Is polite?' }).callApi('Thanks!');
        expect(result.error).toContain('429 Too Many Requests');
        expect(result.error).toContain('req_exhausted');
        expect(result.error).toContain('Capacity exceeded');
        expect(result.error).toContain(quota ? 'Quota exceeded' : 'Rate limit exceeded');
        expect(result.error).not.toContain(API_KEY);
        if (quota) {
          expect(result.error).not.toContain('retry after');
        }
      },
    );

    it('bounds and redacts non-JSON HTTP error diagnostics', async () => {
      mockedFetchWithCache.mockResolvedValue({
        ...mockResponse(null, {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'x-typesafe-request-id': 'req_html' },
        }),
        data: `<html>Overloaded ${API_KEY} ${'x'.repeat(3000)}</html>`,
      });
      const result = await createProvider({ instructions: 'Is polite?' }).callApi('Thanks!');
      expect(result.error).toContain('502 Bad Gateway');
      expect(result.error).toContain('req_html');
      expect(result.error).toContain('Overloaded');
      expect(result.error).not.toContain(API_KEY);
      expect(result.error!.length).toBeLessThanOrEqual(1000);
    });

    it('evicts malformed non-JSON success responses', async () => {
      const response = {
        ...mockResponse(null, { headers: { 'x-typesafe-request-id': 'req_bad' } }),
        data: '<html>not JSON</html>',
      };
      mockedFetchWithCache.mockResolvedValue(response);
      const result = await createProvider({ instructions: 'Is polite?' }).callApi('Thanks!');
      expect(result.error).toContain('malformed non-JSON');
      expect(result.error).toContain('HTTP 200');
      expect(result.error).toContain('req_bad');
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    it('propagates abort errors instead of returning a grading error', async () => {
      const error = new DOMException('Cancelled', 'AbortError');
      mockedFetchWithCache.mockRejectedValue(error);
      await expect(createProvider({ instructions: 'Is polite?' }).callApi('Thanks!')).rejects.toBe(
        error,
      );
    });

    it('does not start transport for an already aborted request', async () => {
      const signal = AbortSignal.abort();
      await expect(
        createProvider({ instructions: 'Is polite?' }).callApi('Thanks!', undefined, {
          abortSignal: signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it('passes the signal and shared retry policy to transport', async () => {
      mockedFetchWithCache.mockResolvedValue(mockResponse(jevResponse({ type: 'noul', noul: 1 })));
      const { signal } = new AbortController();
      await createProvider({ instructions: 'Is polite?', maxRetries: 2 }).callApi(
        'Thanks!',
        undefined,
        { abortSignal: signal },
      );
      expect(lastRequest().options).toMatchObject({ signal, retryableStatusCodes: [529] });
      expect(mockedFetchWithCache.mock.calls[0][5]).toBe(2);
      expect(createProvider().handlesOwnRetries).toBe(true);
    });

    it('honors an ambient retry override when config does not override it', async () => {
      mockedFetchWithCache.mockResolvedValue(mockResponse(jevResponse({ type: 'noul', noul: 1 })));
      await withFetchRetryContext(0, () =>
        createProvider({ instructions: 'Is polite?' }).callApi('Thanks!'),
      );
      expect(mockedFetchWithCache.mock.calls[0][5]).toBe(0);
    });

    it('reports fetch failures', async () => {
      mockedFetchWithCache.mockRejectedValue(
        new Error('Error parsing response: Unexpected token <'),
      );

      const result = await createProvider().callApi(
        'rendered grading prompt',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.error).toBe(
        'TypeSafe API call error: Error: Error parsing response: Unexpected token <',
      );
    });

    it.each([
      ['a response without answers', { model: 'jev-1.13.0' }, /malformed response/],
      ['a non-object response', 'not json', /malformed response/],
      ['a missing answer', { answers: {} }, /no noul answer for "grade"/],
      ['the wrong answer type', jevResponse({ type: 'score', score: 1 }), /no noul answer/],
      ['a non-numeric Noul', jevResponse({ type: 'noul', noul: 'high' }), /not a probability/],
      ['a Noul above 1', jevResponse({ type: 'noul', noul: 1.2 }), /not a probability/],
    ])('rejects %s', async (_name, data, error) => {
      const response = mockResponse(data);
      mockedFetchWithCache.mockResolvedValue(response);

      const result = await createProvider().callApi(
        'rendered grading prompt',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.error).toMatch(error);
      expect(result.output).toBeUndefined();
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    it('rejects a Score outside the level range', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'score', score: 2.5 })),
      );

      const result = await createProvider({ levels: LEVELS }).callApi(
        'rendered grading prompt',
        rubricContext('How frustrated?', 'ok'),
      );

      expect(result.error).toMatch(/outside levels 0–2/);
    });

    it.each<[TypeSafeConfig, RegExp]>([
      [{ threshold: 1.5 }, /`threshold` must be a number between 0 and 1/],
      [{ threshold: '0.5' as unknown as number }, /`threshold` must be a number/],
      [{ levels: ['Only one'] }, /`levels` must be an array of 2–10/],
      [{ levels: Array.from({ length: 11 }, (_, i) => `Level ${i}`) }, /`levels` must be/],
      ...[null, 1, false].map<[TypeSafeConfig, RegExp]>((entry) => [
        { levels: ['low', entry] } as TypeSafeConfig,
        /`levels` entries/,
      ]),
      ...[-1, 0.5, Infinity, '2'].map<[TypeSafeConfig, RegExp]>((maxRetries) => [
        { maxRetries } as TypeSafeConfig,
        /`maxRetries` must be/,
      ]),
    ])('rejects invalid config %j', async (config, error) => {
      const result = await createProvider(config).callApi(
        'rendered grading prompt',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.error).toMatch(error);
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('callClassificationApi', () => {
    const classifier = (config: TypeSafeConfig = {}) =>
      createProvider({
        instructions: 'Which team should handle this?',
        labels: ['billing', 'technical', 'sales'],
        ...config,
      });

    it('asks a Choice question and returns the label → probability map', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            {
              type: 'choice',
              choice: 'billing',
              probabilities: { billing: 0.88, technical: 0.12, sales: 0 },
              confidence: 0.81,
            },
            'classification',
          ),
        ),
      );

      const result = await classifier().callClassificationApi(
        'Help! My payouts have been failing for 3 days.',
      );

      expect(lastRequest().body).toEqual({
        state: 'Help! My payouts have been failing for 3 days.',
        model: 'jev-latest',
        questions: {
          classification: {
            type: 'choice',
            instructions: 'Which team should handle this?',
            criteria: { billing: null, technical: null, sales: null },
          },
        },
      });
      expect(result).toEqual({ classification: { billing: 0.88, technical: 0.12, sales: 0 } });
    });

    it('sends label descriptions in order', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            {
              type: 'choice',
              choice: 'refund',
              confidence: 0.8,
              probabilities: { refund: 0.9, other: 0.1 },
            },
            'classification',
          ),
        ),
      );

      await classifier({
        labels: { refund: 'Asks for money back', other: null },
      }).callClassificationApi('I want my money back');

      const { criteria } = lastRequest().body.questions.classification;
      expect(criteria).toEqual({ refund: 'Asks for money back', other: null });
      expect(Object.keys(criteria)).toEqual(['refund', 'other']);
    });

    it('uses JavaScript property order for numeric labels in both the request and cache key', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            { type: 'choice', choice: '1', confidence: 0, probabilities: { '1': 0.5, '2': 0.5 } },
            'classification',
          ),
        ),
      );

      const first = await classifier({ labels: ['2', '1'] }).callClassificationApi('text');
      const firstRequest = lastRequest();
      const second = await classifier({ labels: ['1', '2'] }).callClassificationApi('text');
      const secondRequest = lastRequest();

      expect(first.error).toBeUndefined();
      expect(second).toEqual(first);
      expect(Object.keys(firstRequest.body.questions.classification.criteria)).toEqual(['1', '2']);
      expect(firstRequest.options?.body).toBe(secondRequest.options?.body);
      expect(firstRequest.cacheOptions.cacheKey).toBe(secondRequest.cacheOptions.cacheKey);
    });

    it('passes an explicit cache bypass through for classification', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'choice' }, 'classification')),
      );

      await classifier().callClassificationApi('text', {
        prompt: { raw: 'text', label: 'classifier' },
        vars: {},
        bustCache: true,
      });

      expect(lastRequest().cacheOptions.bust).toBe(true);
    });

    it('works end to end through matchesClassification', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            {
              type: 'choice',
              choice: 'billing',
              confidence: 0.81,
              probabilities: { billing: 0.88, technical: 0.12, sales: 0 },
            },
            'classification',
          ),
        ),
      );

      const result = await matchesClassification('billing', 'My card was charged twice', 0.5, {
        provider: classifier(),
      });

      expect(result).toEqual({
        pass: true,
        score: 0.88,
        reason: 'Classification billing has score 0.88 >= 0.5',
      });
    });

    it.each([
      [{ labels: undefined }, /requires `labels`/],
      [{ labels: ['billing'] }, /must have 2–255 options, got 1/],
      [{ labels: ['billing', 'billing'] }, /must not contain duplicates/],
      [{ labels: ['billing', ''] }, /must be non-empty strings/],
      [{ instructions: undefined }, /requires `instructions`/],
      [{ instructions: '  ' }, /requires `instructions`/],
    ])('rejects invalid classification config %j', async (config, error) => {
      const result = await classifier(config).callClassificationApi('text');

      expect(result.error).toMatch(error);
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it.each([
      { probabilities: {} },
      { probabilities: { billing: 1 } },
      { probabilities: { billing: 0.8, technical: 0.1, other: 0.1 } },
      { probabilities: { billing: 0.8, technical: 0.1, sales: 0.1, extra: 0 } },
      { probabilities: { billing: 0.8, technical: 0.1, sales: 0.2 } },
      { probabilities: { billing: 0.6, technical: 0.1, sales: 0.1 } },
      { probabilities: { billing: 1, technical: 0.1, sales: -0.1 } },
      { probabilities: { billing: '0.8', technical: 0.1, sales: 0.1 } },
      { probabilities: { billing: null, technical: 0.1, sales: 0.1 } },
      { choice: undefined },
      { choice: 'missing' },
      { choice: 'sales' },
      { confidence: undefined },
      { confidence: -0.1 },
      { confidence: 1.1 },
      { confidence: '0.8' },
    ])('rejects and evicts malformed Choice answers: %j', async (overrides) => {
      const response = mockResponse(
        jevResponse(
          {
            type: 'choice',
            choice: 'billing',
            confidence: 0.8,
            probabilities: { billing: 0.8, technical: 0.1, sales: 0.1 },
            ...overrides,
          },
          'classification',
        ),
      );
      mockedFetchWithCache.mockResolvedValue(response);
      const result = await classifier().callClassificationApi('text');
      expect(result.error).toMatch(/TypeSafe Choice answer has (?:an )?invalid/);
      expect(result.classification).toBeUndefined();
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    it('accepts rounded probabilities whose sum is close to one', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            {
              type: 'choice',
              choice: 'billing',
              confidence: 0,
              probabilities: { billing: 0.333333, technical: 0.333333, sales: 0.333333 },
            },
            'classification',
          ),
        ),
      );
      const result = await classifier().callClassificationApi('text');
      expect(result.error).toBeUndefined();
      expect(result.classification).toEqual({
        billing: 0.333333,
        technical: 0.333333,
        sales: 0.333333,
      });
    });

    it.each([
      { probability: 0.003922, valid: true },
      { probability: 0.00393, valid: false },
      { probability: 0.0039, valid: false },
    ])('checks cumulative rounding across 255 labels: %j', async ({ probability, valid }) => {
      const labels = Array.from({ length: 255 }, (_, index) => `label-${index}`);
      const probabilities = Object.fromEntries(labels.map((label) => [label, probability]));
      const response = mockResponse(
        jevResponse(
          { type: 'choice', choice: labels[0], confidence: 0, probabilities },
          'classification',
        ),
      );
      mockedFetchWithCache.mockResolvedValue(response);

      const result = await classifier({ labels }).callClassificationApi('text');

      if (valid) {
        expect(result).toEqual({ classification: probabilities });
        expect(response.deleteFromCache).not.toHaveBeenCalled();
      } else {
        expect(result.error).toMatch(/invalid probabilities/);
        expect(result.classification).toBeUndefined();
        expect(response.deleteFromCache).toHaveBeenCalledOnce();
      }
    });

    it.each([null, 3, false])(
      'rejects unsupported instruction entries: %j',
      async (instructions) => {
        const result = await classifier({
          instructions,
        } as unknown as TypeSafeConfig).callClassificationApi('text');
        expect(result.error).toMatch(/requires `instructions`/);
        expect(mockedFetchWithCache).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['billing', '  '],
      { '': null, other: null },
      { '  ': null, other: null },
      { billing: 1, other: null },
      { billing: false, other: null },
    ])('rejects invalid labels or descriptions: %j', async (labels) => {
      const result = await classifier({ labels } as TypeSafeConfig).callClassificationApi('text');
      expect(result.error).toMatch(/`labels`/);
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it('preserves structured instruction and label description entries', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            {
              type: 'choice',
              choice: 'billing',
              confidence: 0.8,
              probabilities: { billing: 1, other: 0 },
            },
            'classification',
          ),
        ),
      );
      const instructions = [{ task: 'Classify the text' }];
      const labels = { billing: { topic: 'Payments' }, other: ['Everything else'] };
      const result = await classifier({ instructions, labels }).callClassificationApi('text');
      expect(result.error).toBeUndefined();
      expect(lastRequest().body.questions.classification).toMatchObject({
        instructions,
        criteria: labels,
      });
    });

    it('rejects invalid Choice answers', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            { type: 'choice', probabilities: { billing: 'most', technical: 0.1 } },
            'classification',
          ),
        ),
      );

      const result = await classifier().callClassificationApi('text');

      expect(result.error).toMatch(/invalid probabilities/);
      expect(result.classification).toBeUndefined();
    });

    it('rejects a missing Choice answer', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(jevResponse({ type: 'noul', noul: 1 }, 'classification')),
      );

      const result = await classifier().callClassificationApi('text');

      expect(result.error).toMatch(/no choice answer for "classification"/);
    });

    it('reports HTTP errors', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          { detail: 'criteria: too many options' },
          { status: 422, statusText: 'Unprocessable Entity' },
        ),
      );

      const result = await classifier().callClassificationApi('text');

      expect(result.error).toContain('TypeSafe API error: 422 Unprocessable Entity');
      expect(result.error).toContain('too many options');
    });

    it('uses a cache key that depends on the label order', async () => {
      mockedFetchWithCache.mockResolvedValue(
        mockResponse(
          jevResponse(
            { type: 'choice', choice: 'a', confidence: 0, probabilities: { a: 0.5, b: 0.5 } },
            'classification',
          ),
        ),
      );

      await classifier({ labels: ['a', 'b'] }).callClassificationApi('text');
      const first = lastRequest().cacheOptions.cacheKey;
      await classifier({ labels: ['b', 'a'] }).callClassificationApi('text');
      const second = lastRequest().cacheOptions.cacheKey;

      expect(first).not.toBe(second);
    });
  });
});
