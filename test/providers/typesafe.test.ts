import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { matchesClassification } from '../../src/matchers/classification';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { TypeSafeProvider } from '../../src/providers/typesafe';
import { isProviderResponseRateLimited } from '../../src/scheduler/types';
import { mockProcessEnv } from '../util/utils';

import type { TypeSafeConfig } from '../../src/providers/typesafe';
import type { CallApiContextParams } from '../../src/types/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

const mockedFetchWithCache = vi.mocked(fetchWithCache);

const LEVELS = ['Calm', 'Frustrated', 'Very angry'];
const TEAM_PROBABILITIES = { billing: 0.88, technical: 0.12, sales: 0 };

function mockResponse(
  data: unknown,
  overrides: Partial<Awaited<ReturnType<typeof fetchWithCache>>> = {},
) {
  const response = {
    data,
    cached: false,
    status: 200,
    statusText: 'OK',
    headers: { 'x-typesafe-request-id': 'req_123' },
    latencyMs: 12,
    deleteFromCache: vi.fn(),
    ...overrides,
  };
  mockedFetchWithCache.mockResolvedValue(response);
  return response;
}

/** A response shaped like the live API's, answering one question. */
function mockAnswer(
  answer: Record<string, unknown>,
  questionId = 'grade',
  overrides: Parameters<typeof mockResponse>[1] = {},
) {
  return mockResponse(
    {
      model: 'jev-1.13.0',
      answers: { [questionId]: answer },
      usage: { input_tokens: 296, output_tokens: 20 },
    },
    overrides,
  );
}

function rubricContext(rubric: unknown, output: unknown): CallApiContextParams {
  return {
    prompt: { raw: 'rendered grading prompt', label: 'llm-rubric' },
    vars: { rubric, output } as CallApiContextParams['vars'],
  };
}

function createProvider(config: TypeSafeConfig = {}) {
  return new TypeSafeProvider('jev-latest', { config: { apiKey: 'test-key', ...config } });
}

function lastRequest() {
  const [url, options, , , bustCache] = mockedFetchWithCache.mock.calls.at(-1)!;
  return { url, options, bustCache, body: JSON.parse(options?.body as string) };
}

describe('TypeSafeProvider', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({ TYPESAFE_API_KEY: undefined });
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('setup', () => {
    it('identifies itself by model, or by a custom id', () => {
      expect(createProvider().id()).toBe('typesafe:jev-latest');
      expect(createProvider().toString()).toBe('[TypeSafe Provider jev-latest]');
      expect(new TypeSafeProvider('jev-latest', { id: 'my-grader' }).id()).toBe('my-grader');
    });

    it('resolves the API key from config, then env overrides, then the environment', () => {
      const restoreKey = mockProcessEnv({ TYPESAFE_API_KEY: 'process-key' });
      try {
        const env = { TYPESAFE_API_KEY: 'override-key' };
        expect(new TypeSafeProvider('jev-latest').getApiKey()).toBe('process-key');
        expect(new TypeSafeProvider('jev-latest', { env }).getApiKey()).toBe('override-key');
        expect(
          new TypeSafeProvider('jev-latest', { env, config: { apiKey: 'config-key' } }).getApiKey(),
        ).toBe('config-key');
      } finally {
        restoreKey();
      }
    });

    it('returns an error without calling the API when no key is set', async () => {
      const provider = new TypeSafeProvider('jev-latest');
      const result = await provider.callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(result.error).toContain('TYPESAFE_API_KEY');
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it('sends an authenticated request to the configured base URL', async () => {
      mockAnswer({ type: 'noul', noul: 0.9 });
      await createProvider({ apiBaseUrl: 'http://localhost:8080' }).callApi(
        '',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(lastRequest().url).toBe('http://localhost:8080/v1/systemone');
      expect(lastRequest().options).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      });
    });
  });

  describe('llm-rubric grading', () => {
    it('asks the rubric as a Noul question about the output', async () => {
      const answer = { type: 'noul', noul: 0.95 };
      mockAnswer(answer);

      const result = await createProvider().callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(lastRequest().url).toBe('https://api.typesafe.ai/v1/systemone');
      expect(lastRequest().body).toEqual({
        state: 'Thanks!',
        model: 'jev-latest',
        questions: { grade: { type: 'noul', instructions: 'Is polite' } },
      });
      expect(result).toEqual({
        output: {
          pass: true,
          score: 0.95,
          reason: 'Jev Noul probability 0.95 >= threshold 0.5',
        },
        cached: false,
        latencyMs: 12,
        tokenUsage: { total: 316, prompt: 296, completion: 20, numRequests: 1 },
        cost: 296 * (0.042 / 1_000_000),
        metadata: { typesafe: { model: 'jev-1.13.0', requestId: 'req_123', answer } },
      });
    });

    it('fails a Noul probability below the configured threshold', async () => {
      mockAnswer({ type: 'noul', noul: 0.6 });

      const result = await createProvider({ threshold: 0.7 }).callApi(
        '',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.output).toEqual({
        pass: false,
        score: 0.6,
        reason: 'Jev Noul probability 0.6 < threshold 0.7',
      });
    });

    it('asks a Score question when levels are configured and normalizes the score', async () => {
      mockAnswer({ type: 'score', score: 1.43, confidence: 0.5 });

      const result = await createProvider({ levels: LEVELS }).callApi(
        '',
        rubricContext('How frustrated is the customer?', 'Fix this now.'),
      );

      expect(lastRequest().body.questions).toEqual({
        grade: { type: 'score', instructions: 'How frustrated is the customer?', criteria: LEVELS },
      });
      expect(result.output).toEqual({
        pass: true,
        score: 0.715,
        reason:
          'Jev Score 1.43 on levels 0–2 (0.715 normalized) >= threshold 0.5; nearest level: "Frustrated"',
      });
    });

    it('keeps float error out of the threshold comparison', async () => {
      // 0.3 / 3 is 0.09999999999999999 in floating point, which would miss a 0.1 threshold.
      mockAnswer({ type: 'score', score: 0.3 });

      const result = await createProvider({ levels: ['a', 'b', 'c', 'd'], threshold: 0.1 }).callApi(
        '',
        rubricContext('Rate it', 'text'),
      );

      expect(result.output).toMatchObject({ pass: true, score: 0.1 });
    });

    it('rejects fewer than two levels without calling the API', async () => {
      const result = await createProvider({ levels: ['Only'] }).callApi(
        '',
        rubricContext('Rate it', 'text'),
      );

      expect(result.error).toContain('at least two Score levels');
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it.each([
      ['an object', { order: 'A-104', refunded: true }, { order: 'A-104', refunded: true }],
      ['an array', ['Hi', 'Refund please'], ['Hi', 'Refund please']],
      ['JSON text', '{"order":"A-104"}', { order: 'A-104' }],
      // llm-rubric JSON-parses outputs, and Jev rejects a non-text scalar as state.
      ['a number', 42, '42'],
      ['a boolean', false, 'false'],
      ['null', null, 'null'],
      ['an empty output', '', ''],
    ])('sends %s output as state', async (_name, output, state) => {
      mockAnswer({ type: 'noul', noul: 0.9 });

      await createProvider().callApi('', rubricContext('Is valid', output));

      expect(lastRequest().body.state).toEqual(state);
    });

    it('reports cached responses and their tokens as cached', async () => {
      mockAnswer({ type: 'noul', noul: 0.9 }, 'grade', { cached: true });

      const result = await createProvider().callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(result.cached).toBe(true);
      expect(result.tokenUsage).toEqual({ cached: 316, total: 316 });
    });

    it('leaves cost undefined for a model without published pricing', async () => {
      mockResponse({ model: 'jev-9.0.0', answers: { grade: { type: 'noul', noul: 0.9 } } });

      const result = await createProvider().callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(result.cost).toBeUndefined();
      expect(result.tokenUsage).toEqual({ total: 0, prompt: 0, completion: 0, numRequests: 1 });
    });

    it.each([
      [{ bustCache: true }, true],
      [{ debug: true }, true],
      [{}, undefined],
    ])('bypasses the cache for context %j', async (flags, bustCache) => {
      mockAnswer({ type: 'noul', noul: 0.9 });

      await createProvider().callApi('', { ...rubricContext('Is polite', 'Thanks!'), ...flags });

      expect(lastRequest().bustCache).toBe(bustCache);
    });

    it('works end to end through matchesLlmRubric', async () => {
      const answer = { type: 'noul', noul: 0.12 };
      mockAnswer(answer);

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
        reason: 'Jev Noul probability 0.12 < threshold 0.5',
        tokensUsed: { total: 316, prompt: 296, completion: 20 },
      });
      expect(result.metadata?.typesafe).toEqual({
        model: 'jev-1.13.0',
        requestId: 'req_123',
        answer,
      });
    });

    it.each([
      { providerThreshold: undefined, assertionThreshold: 0.3, pass: false },
      { providerThreshold: 0.3, assertionThreshold: 0.5, pass: false },
      { providerThreshold: 0.3, assertionThreshold: 0.3, pass: true },
      { providerThreshold: 0.3, assertionThreshold: undefined, pass: true },
    ])('requires both the provider and assertion thresholds: %j', async (thresholds) => {
      mockAnswer({ type: 'noul', noul: 0.4 });

      const result = await matchesLlmRubric(
        'Is polite',
        'Thanks!',
        { provider: createProvider({ threshold: thresholds.providerThreshold }) },
        undefined,
        { type: 'llm-rubric', value: 'Is polite', threshold: thresholds.assertionThreshold },
      );

      expect(result).toMatchObject({ pass: thresholds.pass, score: 0.4 });
    });
  });

  describe('classification', () => {
    const instructions = 'Which team should handle this?';

    function mockChoice(probabilities: Record<string, number>) {
      return mockAnswer(
        { type: 'choice', choice: 'billing', confidence: 0.81, probabilities },
        'classification',
      );
    }

    it('asks a Choice question over a list of labels', async () => {
      mockChoice(TEAM_PROBABILITIES);

      const result = await createProvider({
        instructions,
        labels: ['billing', 'technical', 'sales'],
      }).callClassificationApi('My card was charged twice');

      expect(lastRequest().body).toEqual({
        state: 'My card was charged twice',
        model: 'jev-latest',
        questions: {
          classification: {
            type: 'choice',
            instructions,
            criteria: { billing: null, technical: null, sales: null },
          },
        },
      });
      expect(result).toEqual({ classification: TEAM_PROBABILITIES });
    });

    it('sends label descriptions when labels is a map', async () => {
      const labels = { billing: 'Payments and refunds', technical: 'Bugs', sales: null };
      mockChoice(TEAM_PROBABILITIES);

      await createProvider({ instructions, labels }).callClassificationApi('text');

      expect(lastRequest().body.questions.classification.criteria).toEqual(labels);
    });

    it('accepts probabilities that do not sum to exactly 1', async () => {
      // The live API rounds each probability to two decimals, so large label sets sum to 0.99.
      const probabilities = { billing: 0.33, technical: 0.33, sales: 0.33 };
      mockChoice(probabilities);

      const result = await createProvider({
        instructions,
        labels: ['billing', 'technical', 'sales'],
      }).callClassificationApi('text');

      expect(result).toEqual({ classification: probabilities });
    });

    it.each([[{ labels: ['a', 'b'] }], [{ instructions }], [{}]])(
      'requires instructions and labels: %j',
      async (config) => {
        const result = await createProvider(config).callClassificationApi('text');

        expect(result.error).toContain('needs `instructions` and `labels`');
        expect(mockedFetchWithCache).not.toHaveBeenCalled();
      },
    );

    it('works end to end through matchesClassification', async () => {
      mockChoice(TEAM_PROBABILITIES);

      const result = await matchesClassification('billing', 'My card was charged twice', 0.5, {
        provider: createProvider({ instructions, labels: ['billing', 'technical', 'sales'] }),
      });

      expect(result).toEqual({
        pass: true,
        score: 0.88,
        reason: 'Classification billing has score 0.88 >= 0.5',
      });
    });
  });

  describe('answering configured questions', () => {
    const questions: TypeSafeConfig['questions'] = {
      urgent: { type: 'noul', instructions: 'Does this convey urgency?' },
      team: {
        type: 'choice',
        instructions: 'Which team?',
        criteria: { billing: null, sales: null },
      },
    };
    const answers = {
      urgent: { type: 'noul', noul: 0.95 },
      team: {
        type: 'choice',
        choice: 'billing',
        confidence: 0.9,
        probabilities: { billing: 0.95, sales: 0.05 },
      },
    };

    it('sends the prompt as state and returns the answers as output', async () => {
      mockResponse({
        model: 'jev-1.13.0',
        answers,
        usage: { input_tokens: 400, output_tokens: 50 },
      });

      const result = await createProvider({ questions }).callApi('Payouts are failing!');

      expect(lastRequest().body).toEqual({
        state: 'Payouts are failing!',
        model: 'jev-latest',
        questions,
      });
      expect(result).toEqual({
        output: answers,
        cached: false,
        latencyMs: 12,
        tokenUsage: { total: 450, prompt: 400, completion: 50, numRequests: 1 },
        cost: 400 * (0.042 / 1_000_000),
        metadata: { typesafe: { model: 'jev-1.13.0', requestId: 'req_123' } },
      });
    });

    it('sends a JSON prompt as structured state', async () => {
      mockResponse({ model: 'jev-1.13.0', answers });

      await createProvider({ questions }).callApi('{"ticket":"Payouts are failing!","plan":"pro"}');

      expect(lastRequest().body.state).toEqual({ ticket: 'Payouts are failing!', plan: 'pro' });
    });

    it('lets the prompt config override the questions', async () => {
      const promptQuestions = { spam: { type: 'noul', instructions: 'Is this spam?' } };
      mockResponse({ model: 'jev-1.13.0', answers: { spam: { type: 'noul', noul: 0.01 } } });

      await createProvider({ questions }).callApi('Hello', {
        prompt: { raw: 'Hello', label: 'Hello', config: { questions: promptQuestions } },
        vars: {},
      });

      expect(lastRequest().body.questions).toEqual(promptQuestions);
    });

    it.each([
      ['no context', undefined],
      // Other model-graded assertions send a text-generation prompt Jev cannot answer.
      ['another grader', { prompt: { raw: 'p', label: 'factuality' }, vars: { rubric: 'r' } }],
    ])('explains how to use the provider when it has no questions: %s', async (_name, context) => {
      const result = await createProvider().callApi('Hello', context);

      expect(result.error).toContain('needs `questions`');
      expect(result.error).toContain('`llm-rubric` or `classifier`');
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    const context = rubricContext('Is polite', 'Thanks!');

    // Error bodies captured from the live API.
    it.each([
      [
        401,
        'Unauthorized',
        {
          detail: {
            error_type: 'authentication_error',
            message:
              'Cannot authenticate with the server. Please check your API key and try again.',
          },
        },
        'TypeSafe API error: 401 Unauthorized (request id req_123)\nCannot authenticate with the server. Please check your API key and try again.',
      ],
      [
        400,
        'Bad Request',
        { detail: { error_type: 'max_tokens_exceeded' } },
        'TypeSafe API error: 400 Bad Request (request id req_123)\nmax_tokens_exceeded',
      ],
      [
        400,
        'Bad Request',
        { detail: 'Too many score levels. Must have at most 10 levels.' },
        'TypeSafe API error: 400 Bad Request (request id req_123)\nToo many score levels. Must have at most 10 levels.',
      ],
      [
        422,
        'Unprocessable Entity',
        {
          detail: [
            { loc: ['body', 'state', 'str'], msg: 'Input should be a valid string', input: 42 },
            { loc: ['body', 'questions'], msg: 'Field required' },
          ],
        },
        'TypeSafe API error: 422 Unprocessable Entity (request id req_123)\nbody.state.str: Input should be a valid string; body.questions: Field required',
      ],
      [
        502,
        'Bad Gateway',
        'Empty Response: 502: Bad Gateway',
        'TypeSafe API error: 502 Bad Gateway (request id req_123)\nEmpty Response: 502: Bad Gateway',
      ],
    ])('reports HTTP %i %s with the API detail', async (status, statusText, data, error) => {
      mockResponse(data, { status, statusText });

      await expect(createProvider().callApi('', context)).resolves.toEqual({ error });
    });

    it.each([
      ['the server Retry-After', { 'retry-after': '7', 'set-cookie': 'session=1' }, '7'],
      ['a short default delay', {}, '2'],
    ])('marks 529 Overloaded as a retryable rate limit with %s', async (_name, headers, delay) => {
      mockResponse({ detail: 'Overloaded' }, { status: 529, statusText: '', headers });

      const result = await createProvider().callApi('', context);

      expect(result).toEqual({
        error: 'TypeSafe API error: 529\nOverloaded',
        metadata: {
          rateLimitKind: 'rate_limit',
          http: { status: 529, statusText: '', headers: { 'retry-after': delay } },
        },
      });
      expect(isProviderResponseRateLimited(result, undefined)).toBe(true);
    });

    it('returns transport failures as errors', async () => {
      mockedFetchWithCache.mockRejectedValue(
        new Error('Request failed after 4 retries: ECONNRESET'),
      );

      const result = await createProvider().callApi('', context);

      expect(result).toEqual({
        error: 'TypeSafe API call error: Error: Request failed after 4 retries: ECONNRESET',
      });
    });

    it('passes the abort signal to fetch and rethrows cancellation', async () => {
      const controller = new AbortController();
      mockedFetchWithCache.mockImplementation(async () => {
        controller.abort();
        throw new Error('fetch failed');
      });

      await expect(
        createProvider().callApi('', context, { abortSignal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(lastRequest().options?.signal).toBe(controller.signal);
    });

    it.each([
      ['no answers', { model: 'jev-1.13.0' }],
      ['a missing answer', { answers: {} }],
      ['a non-numeric answer', { answers: { grade: { type: 'noul', noul: 'yes' } } }],
      ['a non-object body', 'ok'],
    ])('evicts and reports a grading response with %s', async (_name, data) => {
      const response = mockResponse(data);

      const result = await createProvider().callApi('', context);

      expect(result).toEqual({
        error: `TypeSafe API returned an unexpected response (request id req_123): ${JSON.stringify(data)}`,
      });
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    it.each([
      ['no probabilities', { type: 'choice', choice: 'a' }],
      ['non-numeric probabilities', { type: 'choice', probabilities: { a: '0.9', b: 0.1 } }],
    ])('evicts and reports a classification response with %s', async (_name, answer) => {
      const response = mockAnswer(answer, 'classification');

      const result = await createProvider({
        instructions: 'Which?',
        labels: ['a', 'b'],
      }).callClassificationApi('text');

      expect(result.error).toContain('TypeSafe API returned an unexpected response');
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    it('returns classification API errors', async () => {
      mockResponse(
        { detail: 'Too many choices. Must have at most 255 choices.' },
        { status: 400, statusText: 'Bad Request' },
      );

      const result = await createProvider({
        instructions: 'Which?',
        labels: ['a', 'b'],
      }).callClassificationApi('text');

      expect(result).toEqual({
        error:
          'TypeSafe API error: 400 Bad Request (request id req_123)\nToo many choices. Must have at most 255 choices.',
      });
    });
  });
});
