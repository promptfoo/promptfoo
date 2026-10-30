import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { matchesClassification } from '../../src/matchers/classification';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { NaceProvider } from '../../src/providers/nace';
import { isProviderResponseRateLimited } from '../../src/scheduler/types';
import { mockProcessEnv } from '../util/utils';

import type { NaceConfig } from '../../src/providers/nace';
import type { TypeSafeQuestion } from '../../src/providers/typesafe';
import type { CallApiContextParams } from '../../src/types/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

const mockedFetchWithCache = vi.mocked(fetchWithCache);

// A 1x1 PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const LEVELS = ['Calm', 'Frustrated', 'Very angry'];

/** `body` is serialized, because the provider reads the response as text. */
function mockResponse(
  body: unknown,
  overrides: Partial<Awaited<ReturnType<typeof fetchWithCache>>> = {},
) {
  const response = {
    data: typeof body === 'string' ? body : JSON.stringify(body),
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
function mockAnswer(answer: Record<string, unknown>, questionId = 'grade') {
  return mockResponse({
    model: 'drex-max',
    answers: { [questionId]: answer },
    usage: { input_tokens: 296, output_tokens: 20 },
    evaluation_time_ms: 150.2,
    request_id: 'req_123',
  });
}

function rubricContext(rubric: unknown, output: unknown): CallApiContextParams {
  return {
    prompt: { raw: 'rendered grading prompt', label: 'llm-rubric' },
    vars: { rubric, output } as CallApiContextParams['vars'],
  };
}

function createProvider(config: NaceConfig = {}, modelName = 'drex-max') {
  return new NaceProvider(modelName, { config: { apiKey: 'test-key', ...config } });
}

function lastRequest() {
  const [url, options] = mockedFetchWithCache.mock.calls.at(-1)!;
  return { url, options, body: JSON.parse(options?.body as string) };
}

describe('NaceProvider', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({ NACE_API_KEY: undefined });
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('setup', () => {
    it('identifies itself by model, or by a custom id', () => {
      expect(createProvider().id()).toBe('nace:drex-max');
      expect(createProvider().toString()).toBe('[Nace Provider drex-max]');
      expect(new NaceProvider('drex-max', { id: 'my-grader' }).id()).toBe('my-grader');
    });

    it('resolves the API key from config, then env overrides, then the environment', () => {
      const restoreKey = mockProcessEnv({ NACE_API_KEY: 'process-key' });
      try {
        const env = { NACE_API_KEY: 'override-key' };
        expect(new NaceProvider('drex-max').getApiKey()).toBe('process-key');
        expect(new NaceProvider('drex-max', { env }).getApiKey()).toBe('override-key');
        expect(
          new NaceProvider('drex-max', { env, config: { apiKey: 'config-key' } }).getApiKey(),
        ).toBe('config-key');
      } finally {
        restoreKey();
      }
    });

    it('returns an error naming NACE_API_KEY without calling the API when no key is set', async () => {
      const result = await new NaceProvider('drex-max').callApi(
        '',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(result.error).toContain('NACE_API_KEY');
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it('sends an authenticated request to console.nace.ai by default', async () => {
      mockAnswer({ type: 'noul', noul: 0.9 });
      await createProvider().callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(lastRequest().url).toBe('https://console.nace.ai/v1/systemone');
      expect(lastRequest().options).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      });
    });

    it('never sends the environment key to a custom host', async () => {
      const restoreKey = mockProcessEnv({ NACE_API_KEY: 'process-key' });
      try {
        const result = await new NaceProvider('drex-max', {
          config: { apiBaseUrl: 'https://proxy.example.com' },
        }).callApi('', rubricContext('Is polite', 'Thanks!'));

        expect(result.error).toContain('`apiKey` must be set in the provider config');
        expect(result.error).not.toContain('process-key');
        expect(mockedFetchWithCache).not.toHaveBeenCalled();
      } finally {
        restoreKey();
      }
    });

    it('sends a configured apiKey to a custom host, and the environment key to console.nace.ai', async () => {
      const restoreKey = mockProcessEnv({ NACE_API_KEY: 'process-key' });
      try {
        mockAnswer({ type: 'noul', noul: 0.9 });
        await createProvider({ apiBaseUrl: 'https://proxy.example.com' }).callApi(
          '',
          rubricContext('Is polite', 'Thanks!'),
        );
        expect(lastRequest().options?.headers).toMatchObject({ Authorization: 'Bearer test-key' });

        await new NaceProvider('drex-max', {
          config: { apiBaseUrl: 'https://console.nace.ai' },
        }).callApi('', rubricContext('Is polite', 'Thanks!'));
        expect(lastRequest().options?.headers).toMatchObject({
          Authorization: 'Bearer process-key',
        });
      } finally {
        restoreKey();
      }
    });

    it('records the request id from the x-typesafe-request-id header', async () => {
      mockAnswer({ type: 'noul', noul: 0.9 });

      const result = await createProvider().callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(result.metadata?.nace).toMatchObject({ requestId: 'req_123' });
    });

    it.each([
      ['no request id header', {}],
      ['only an x-request-id header', { 'x-request-id': 'req_other' }],
    ])('records no request id with %s', async (_name, headers) => {
      mockAnswer({ type: 'noul', noul: 0.9 }, 'grade');
      mockResponse(
        { model: 'drex-max', answers: { grade: { type: 'noul', noul: 0.9 } } },
        { headers },
      );

      const result = await createProvider().callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(result.metadata?.nace).not.toHaveProperty('requestId');
    });

    it('honors a custom apiBaseUrl', async () => {
      mockAnswer({ type: 'noul', noul: 0.9 });
      await createProvider({ apiBaseUrl: 'http://localhost:8080' }).callApi(
        '',
        rubricContext('Is polite', 'Thanks!'),
      );

      expect(lastRequest().url).toBe('http://localhost:8080/v1/systemone');
    });
  });

  describe('llm-rubric grading', () => {
    it('asks the rubric as a Noul question and prices the input tokens', async () => {
      const answer = { type: 'noul', noul: 0.95 };
      mockAnswer(answer);

      const result = await createProvider().callApi('', rubricContext('Is polite', 'Thanks!'));

      expect(lastRequest().body).toEqual({
        state: 'Thanks!',
        model: 'drex-max',
        questions: { grade: { type: 'noul', instructions: 'Is polite' } },
      });
      expect(result).toEqual({
        output: {
          pass: true,
          score: 0.95,
          reason: 'Drex Noul probability 0.95 >= threshold 0.5',
        },
        cached: false,
        latencyMs: 12,
        tokenUsage: { total: 316, prompt: 296, completion: 20, numRequests: 1 },
        cost: 296 * (0.03 / 1_000_000),
        metadata: { nace: { model: 'drex-max', requestId: 'req_123', answer } },
      });
    });

    it('keeps JSON-looking rubric and level strings as strings', async () => {
      mockAnswer({ type: 'score', score: 1, legend: ['{"a":1}', '[2]'], confidence: 0.5 });

      await createProvider({ levels: ['{"a":1}', '[2]'] }).callApi(
        '',
        rubricContext('{"criterion":"polite"}', '{"reply":"Thanks!"}'),
      );

      expect(lastRequest().body.questions.grade).toEqual({
        type: 'score',
        instructions: '{"criterion":"polite"}',
        criteria: ['{"a":1}', '[2]'],
      });
    });

    it('rejects an object rubric before calling Drex', async () => {
      const result = await createProvider().callApi('', {
        ...rubricContext('x', 'y'),
        vars: { rubric: { criterion: 'polite' }, output: 'y' },
      });

      expect(result.error).toContain('Nace rubrics and `levels` must be strings');
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it.each([
      ['a negative probability', { '0': -1, '1': 2, '2': 0 }],
      ['probabilities that do not sum to 1', { '0': 0.2, '1': 0.2, '2': 0.2 }],
      ['probabilities above 1', { '0': 1.5, '1': -0.5, '2': 0 }],
      ['keys that do not match the levels', { '0': 0.5, '1': 0.5 }],
      ['unexpected keys', { '0': 0.5, '1': 0.5, '3': 0 }],
    ])('rejects and evicts a Score answer with %s', async (_name, probabilities) => {
      const response = mockAnswer({ type: 'score', score: 0.8, legend: LEVELS, probabilities });

      const result = await createProvider({ levels: LEVELS }).callApi(
        '',
        rubricContext('How frustrated?', 'Fix this now.'),
      );

      expect(result.error).toContain('Nace API returned an unexpected response');
      expect(result.output).toBeUndefined();
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    it('rejects and evicts a Score answer whose legend differs from the levels', async () => {
      const response = mockAnswer({
        type: 'score',
        score: 0.8,
        legend: [...LEVELS].reverse(),
        probabilities: { '0': 0.2, '1': 0.3, '2': 0.5 },
      });

      const result = await createProvider({ levels: LEVELS }).callApi(
        '',
        rubricContext('How frustrated?', 'Fix this now.'),
      );

      expect(result.error).toContain('Nace API returned an unexpected response');
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    it('accepts a Score answer with a valid probability distribution', async () => {
      mockAnswer({
        type: 'score',
        score: 0.8,
        legend: LEVELS,
        probabilities: { '0': 0.3, '1': 0.6, '2': 0.1 },
      });

      const result = await createProvider({ levels: LEVELS }).callApi(
        '',
        rubricContext('How frustrated?', 'Fix this now.'),
      );

      expect(result.error).toBeUndefined();
    });

    it('asks a Score question when levels are configured and normalizes the score', async () => {
      mockAnswer({ type: 'score', score: 1.43, legend: LEVELS, confidence: 0.5 });

      const result = await createProvider({ levels: LEVELS, threshold: 0.8 }).callApi(
        '',
        rubricContext('How frustrated is the customer?', 'Fix this now.'),
      );

      expect(lastRequest().body.questions).toEqual({
        grade: { type: 'score', instructions: 'How frustrated is the customer?', criteria: LEVELS },
      });
      expect(result.output).toEqual({
        pass: false,
        score: 0.715,
        reason:
          'Drex Score 1.43 on levels 0–2 (0.715 normalized) < threshold 0.8; nearest level: "Frustrated"',
      });
    });

    it('works end to end through matchesLlmRubric', async () => {
      const answer = { type: 'noul', noul: 0.12 };
      mockAnswer(answer);

      const result = await matchesLlmRubric('Speaks like a pirate', 'Good morning, sir.', {
        provider: createProvider(),
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0.12,
        reason: 'Drex Noul probability 0.12 < threshold 0.5',
      });
      expect(result.metadata?.nace).toEqual({ model: 'drex-max', requestId: 'req_123', answer });
    });
  });

  describe('classification', () => {
    it('asks a Choice question over the labels', async () => {
      const probabilities = { billing: 0.88, technical: 0.12, sales: 0 };
      mockAnswer(
        { type: 'choice', choice: 'billing', confidence: 0.81, probabilities },
        'classification',
      );

      const result = await createProvider({
        instructions: 'Which team should handle this?',
        labels: ['billing', 'technical', 'sales'],
      }).callClassificationApi('My card was charged twice');

      expect(lastRequest().body).toEqual({
        state: 'My card was charged twice',
        model: 'drex-max',
        questions: {
          classification: {
            type: 'choice',
            instructions: 'Which team should handle this?',
            criteria: { billing: null, technical: null, sales: null },
          },
        },
      });
      expect(result).toEqual({
        classification: probabilities,
        cached: false,
        tokenUsage: { total: 316, prompt: 296, completion: 20, numRequests: 1 },
        metadata: { nace: { model: 'drex-max', requestId: 'req_123' } },
      });
    });

    it('reports a cache hit as cached', async () => {
      const probabilities = { billing: 0.9, technical: 0.1 };
      const response = mockAnswer(
        { type: 'choice', choice: 'billing', confidence: 0.9, probabilities },
        'classification',
      );
      mockedFetchWithCache.mockResolvedValue({ ...response, cached: true });

      const result = await createProvider({
        instructions: 'Which team?',
        labels: ['billing', 'technical'],
      }).callClassificationApi('Charged twice');

      expect(result.cached).toBe(true);
      expect(result.tokenUsage).toEqual({ cached: 316, total: 316 });
    });

    it.each([false, true])(
      'keeps the served model through classifier grading (cached=%s)',
      async (cached) => {
        mockResponse(
          {
            model: 'drex-v2.0',
            answers: {
              classification: {
                type: 'choice',
                choice: 'billing',
                confidence: 0.9,
                probabilities: { billing: 0.9, technical: 0.1 },
              },
            },
            usage: { input_tokens: 296, output_tokens: 20 },
          },
          { cached },
        );

        const result = await matchesClassification('billing', 'Charged twice', 0.5, {
          provider: createProvider(
            { instructions: 'Which team?', labels: ['billing', 'technical'] },
            'drex-latest',
          ),
        });

        expect(lastRequest().body.model).toBe('drex-latest');
        expect(result).toMatchObject({ pass: true, score: 0.9 });
        expect(result.metadata).toEqual({
          nace: { model: 'drex-v2.0', requestId: 'req_123' },
          ...(cached && { cachedResponse: true }),
        });
        expect(result.tokensUsed?.total).toBe(316);
        expect(result.tokensUsed?.cached).toBe(cached ? 316 : 0);
      },
    );

    it('forwards the abort signal to the request', async () => {
      mockAnswer(
        { type: 'choice', choice: 'a', confidence: 0.9, probabilities: { a: 0.9, b: 0.1 } },
        'classification',
      );
      const controller = new AbortController();

      await createProvider({ instructions: 'Which?', labels: ['a', 'b'] }).callClassificationApi(
        'x',
        { abortSignal: controller.signal },
      );

      expect(mockedFetchWithCache.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
    });
    it('rethrows cancellation while classification is in flight', async () => {
      const controller = new AbortController();
      mockedFetchWithCache.mockImplementation(async () => {
        controller.abort();
        throw new Error('fetch failed');
      });

      await expect(
        createProvider({ instructions: 'Which?', labels: ['a', 'b'] }).callClassificationApi('x', {
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(lastRequest().options?.signal).toBe(controller.signal);
    });
  });

  describe('answering configured questions', () => {
    const questions: NaceConfig['questions'] = {
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
      mockResponse({ model: 'drex-max', answers, usage: { input_tokens: 400, output_tokens: 50 } });

      const result = await createProvider({ questions }).callApi('Payouts are failing!');

      expect(lastRequest().body).toEqual({
        state: 'Payouts are failing!',
        model: 'drex-max',
        questions,
      });
      expect(result).toEqual({
        output: answers,
        cached: false,
        latencyMs: 12,
        tokenUsage: { total: 450, prompt: 400, completion: 50, numRequests: 1 },
        cost: 400 * (0.03 / 1_000_000),
        metadata: { nace: { model: 'drex-max', requestId: 'req_123' } },
      });
    });

    it('prices drex-latest by the version that answered', async () => {
      mockResponse({
        model: 'drex-v2.0',
        answers,
        usage: { input_tokens: 400, output_tokens: 50 },
      });

      const result = await createProvider({ questions }, 'drex-latest').callApi('Hello');

      expect(lastRequest().body.model).toBe('drex-latest');
      expect(result.cost).toBe(400 * (0.06 / 1_000_000));
      expect(result.metadata?.nace.model).toBe('drex-v2.0');
    });

    it('prices drex-max-v1.1 like drex-max', async () => {
      mockResponse({
        model: 'drex-max-v1.1',
        answers,
        usage: { input_tokens: 400, output_tokens: 50 },
      });

      const result = await createProvider({ questions }, 'drex-max-v1.1').callApi('Hello');

      expect(lastRequest().body.model).toBe('drex-max-v1.1');
      expect(result.cost).toBe(400 * (0.03 / 1_000_000));
    });

    it('leaves cost undefined for a model without a published price', async () => {
      mockResponse({
        model: 'drex-v3.0',
        answers,
        usage: { input_tokens: 400, output_tokens: 50 },
      });

      const result = await createProvider({ questions }).callApi('Hello');

      expect(result.cost).toBeUndefined();
    });
  });

  describe('images', () => {
    const questions: NaceConfig['questions'] = {
      color: {
        type: 'choice',
        instructions: 'What color is Image 1?',
        criteria: { red: null, blue: null },
      },
    };
    const answer = {
      type: 'choice',
      choice: 'red',
      confidence: 0.99,
      probabilities: { red: 0.99, blue: 0.01 },
    };
    let dir: string;
    let pngPath: string;
    let textPath: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-nace-'));
      pngPath = path.join(dir, 'photo.png');
      textPath = path.join(dir, 'notes.txt');
      fs.writeFileSync(pngPath, Buffer.from(PNG_BASE64, 'base64'));
      fs.writeFileSync(textPath, 'not an image');
    });

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('sends data URLs and base64 as given', async () => {
      mockAnswer(answer, 'color');

      await createProvider({ questions, images: [PNG_DATA_URL, PNG_BASE64] }).callApi('Look.');

      expect(lastRequest().body).toEqual({
        state: 'Look.',
        model: 'drex-max',
        questions,
        images: [PNG_DATA_URL, PNG_BASE64],
      });
    });

    it('reads image files into data URLs, with or without file://', async () => {
      mockAnswer(answer, 'color');

      await createProvider({ questions, images: [pngPath, `file://${pngPath}`] }).callApi('Look.');

      expect(lastRequest().body.images).toEqual([PNG_DATA_URL, PNG_DATA_URL]);
    });

    it('resolves relative paths against the config directory', async () => {
      mockAnswer(answer, 'color');
      const previousBasePath = cliState.basePath;
      cliState.basePath = dir;
      try {
        await createProvider({ questions, images: ['photo.png'] }).callApi('Look.');
      } finally {
        cliState.basePath = previousBasePath;
      }

      expect(lastRequest().body.images).toEqual([PNG_DATA_URL]);
    });

    it('renders templates with the test vars', async () => {
      mockAnswer(answer, 'color');

      await createProvider({ questions, images: ['{{photo}}'] }).callApi('Look.', {
        prompt: { raw: 'Look.', label: 'Look.' },
        vars: { photo: PNG_DATA_URL },
      });

      expect(lastRequest().body.images).toEqual([PNG_DATA_URL]);
    });

    it('attaches the images to llm-rubric grading too', async () => {
      mockAnswer({ type: 'noul', noul: 0.9 });

      await createProvider({ images: [PNG_DATA_URL] }).callApi(
        '',
        rubricContext('Does the reply describe Image 1?', 'A red square.'),
      );

      expect(lastRequest().body).toMatchObject({ state: 'A red square.', images: [PNG_DATA_URL] });
    });

    it.each([
      ['none are configured', undefined],
      ['the list is empty', []],
    ])('sends no images when %s', async (_name, images) => {
      mockAnswer(answer, 'color');

      await createProvider({ questions, images }).callApi('Look.');

      expect(lastRequest().body).not.toHaveProperty('images');
    });

    it.each([
      ['a text file', () => textPath],
      ['a missing file', () => path.join(dir, 'missing.png')],
      ['text that is not base64', () => 'not an image!'],
      ['an empty entry', () => ''],
      ['a mistyped path that looks like base64', () => 'claims/lamp'],
      [
        'base64 that is not an image',
        () => Buffer.from('hello world, not an image').toString('base64'),
      ],
      ['base64 with bad length', () => PNG_BASE64.slice(0, -1)],
    ])('rejects %s without calling the API', async (_name, entry) => {
      const result = await createProvider({ questions, images: [entry()] }).callApi('Look.');

      expect(result.error).toMatch(/^Nace request error: Nace `images` entries must be/);
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });

    it.each([
      ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])],
      [
        'WebP',
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBPVP8 '),
          Buffer.alloc(4),
        ]),
      ],
    ])('accepts bare %s base64', async (_name, bytes) => {
      mockAnswer(answer, 'color');
      const encoded = bytes.toString('base64');

      await createProvider({ questions, images: [encoded] }).callApi('Look.');

      expect(lastRequest().body.images).toEqual([encoded]);
    });

    it('rejects images that are not a list', async () => {
      const result = await createProvider({
        questions,
        images: 'photo.png' as unknown as string[],
      }).callApi('Look.');

      expect(result.error).toContain('Nace `images` must be a list');
      expect(mockedFetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    const context = rubricContext('Is polite', 'Thanks!');

    // Error bodies as documented at https://console.nace.ai/docs/drex/reference/errors.
    it.each([
      [
        422,
        'Unprocessable Entity',
        {
          error: {
            type: 'invalid_request_error',
            message: 'questions.q.type: must be "noul", "choice", or "score"',
            issues: [
              { path: 'questions.q.type', message: 'must be "noul", "choice", or "score"' },
              { path: 'questions.r.criteria.a', message: 'must be a string or null' },
            ],
          },
          request_id: 'req_123',
        },
        'Nace API error: 422 Unprocessable Entity (request id req_123)\nquestions.q.type: must be "noul", "choice", or "score"; questions.r.criteria.a: must be a string or null',
      ],
      [
        422,
        'Unprocessable Entity',
        {
          error: {
            type: 'invalid_request_error',
            message: 'request body must be at most 4194304 bytes',
            issues: [{ path: '', message: 'request body must be at most 4194304 bytes' }],
          },
          request_id: 'req_123',
        },
        'Nace API error: 422 Unprocessable Entity (request id req_123)\nrequest body must be at most 4194304 bytes',
      ],
      [
        422,
        'Unprocessable Entity',
        {
          error: {
            message: 'Invalid request',
            issues: [{ path: 'questions.q', code: 'invalid_type' }, null],
          },
        },
        'Nace API error: 422 Unprocessable Entity (request id req_123)\n{"path":"questions.q","code":"invalid_type"}; null',
      ],
      [
        401,
        'Unauthorized',
        {
          error: {
            type: 'authentication_error',
            message: 'Invalid API key. Pass a nace_sk_ key as `Authorization: Bearer <key>`.',
          },
          request_id: 'req_123',
        },
        'Nace API error: 401 Unauthorized (request id req_123)\nInvalid API key. Pass a nace_sk_ key as `Authorization: Bearer <key>`.',
      ],
      [
        402,
        'Payment Required',
        {
          error: {
            type: 'insufficient_credit',
            message: 'This account has insufficient available funds. Add funds to keep going.',
          },
          request_id: 'req_123',
        },
        'Nace API error: 402 Payment Required (request id req_123)\nThis account has insufficient available funds. Add funds to keep going.',
      ],
      // Not from the API itself: a proxy error page.
      [
        502,
        'Bad Gateway',
        '<html>Bad Gateway</html>',
        'Nace API error: 502 Bad Gateway (request id req_123)\n<html>Bad Gateway</html>',
      ],
    ])('reports HTTP %i %s with the API detail', async (status, statusText, body, error) => {
      mockResponse(body, { status, statusText });

      await expect(createProvider().callApi('', context)).resolves.toEqual({ error });
    });

    it('marks 529 overloaded as a retryable rate limit with the server timing', async () => {
      mockResponse(
        {
          error: { type: 'overloaded', message: 'Drex is temporarily unavailable. Retry shortly.' },
          request_id: 'req_123',
        },
        { status: 529, statusText: '', headers: { 'retry-after-ms': '2000', 'retry-after': '2' } },
      );

      const result = await createProvider().callApi('', context);

      expect(result).toEqual({
        error: 'Nace API error: 529\nDrex is temporarily unavailable. Retry shortly.',
        metadata: {
          rateLimitKind: 'rate_limit',
          http: { status: 529, statusText: '', headers: { 'retry-after-ms': '2000' } },
        },
      });
      expect(isProviderResponseRateLimited(result, undefined)).toBe(true);
    });

    it('evicts and reports a malformed response', async () => {
      const response = mockResponse({ model: 'drex-max', answers: {} });

      const result = await createProvider().callApi('', context);

      expect(result).toEqual({
        error: `Nace API returned an unexpected response (request id req_123): ${response.data}`,
      });
      expect(response.deleteFromCache).toHaveBeenCalledOnce();
    });

    describe('answer validation', () => {
      const classifyConfig = { instructions: 'Which team?', labels: ['a', 'b'] };
      const choice = (probabilities: unknown, extra: Record<string, unknown> = {}) => ({
        type: 'choice',
        choice: 'a',
        confidence: 0.9,
        probabilities,
        ...extra,
      });

      it.each([
        ['probabilities outside 0..1', choice({ a: 2, b: -1 })],
        ['a missing label', choice({ a: 1 })],
        ['an unknown label', choice({ a: 0.5, b: 0.4, c: 0.1 })],
        ['probabilities that do not sum to 1', choice({ a: 0.5, b: 0.3 })],
        ['a choice outside the labels', choice({ a: 0.5, b: 0.5 }, { choice: 'z' })],
        ['a confidence above 1', choice({ a: 0.5, b: 0.5 }, { confidence: 3 })],
        ['a wrong answer type', choice({ a: 0.5, b: 0.5 }, { type: 'noul' })],
      ])('rejects and evicts a classification with %s', async (_name, answer) => {
        const response = mockAnswer(answer, 'classification');

        const result = await createProvider(classifyConfig).callClassificationApi('text');

        expect(result.error).toContain('Nace API returned an unexpected response');
        expect(result.classification).toBeUndefined();
        expect(response.deleteFromCache).toHaveBeenCalledOnce();
      });

      it('accepts probabilities that sum to 1 within the tolerance', async () => {
        mockAnswer(choice({ a: 0.6001, b: 0.4 }), 'classification');

        const result = await createProvider(classifyConfig).callClassificationApi('text');

        expect(result.classification).toEqual({ a: 0.6001, b: 0.4 });
      });

      const questions = {
        n: { type: 'noul', instructions: 'Is it?' },
        s: { type: 'score', instructions: 'How much?', criteria: ['lo', 'mid', 'hi'] },
        c: { type: 'choice', instructions: 'Which?', criteria: { a: null, b: null } },
      } as Record<string, TypeSafeQuestion>;
      const valid = {
        n: { type: 'noul', noul: 0.4 },
        s: { type: 'score', score: 1.5, confidence: 0.5 },
        c: choice({ a: 0.7, b: 0.3 }),
      };

      it('accepts a 30-label choice whose 4-decimal rounding sums past 1e-3', async () => {
        const labels = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`l${i}`, null]));
        // 29 labels under 5e-5 round to 0, so the sum is 0.9988: off by 1.2e-3, within 30 * 5e-5.
        const probabilities = Object.fromEntries(
          Array.from({ length: 30 }, (_, i) => [`l${i}`, i === 0 ? 0.9988 : 0]),
        );
        mockResponse({
          model: 'drex-max',
          answers: { c: { type: 'choice', choice: 'l0', confidence: 0.9, probabilities } },
        });

        const result = await createProvider({
          questions: { c: { type: 'choice', instructions: 'Which?', criteria: labels } },
        }).callApi('state');

        expect(result.error).toBeUndefined();
      });

      it('accepts well-formed answers to every question type', async () => {
        mockResponse({ model: 'drex-max', answers: valid });

        const result = await createProvider({ questions }).callApi('state');

        expect(result.error).toBeUndefined();
        expect(result.output).toEqual(valid);
      });

      it.each([
        ['an empty answer', { n: {} }],
        ['a Noul above 1', { n: { type: 'noul', noul: 2 } }],
        ['a negative Noul', { n: { type: 'noul', noul: -0.1 } }],
        ['a non-numeric Noul', { n: { type: 'noul', noul: '0.5' } }],
        ['a Score past the top level', { s: { type: 'score', score: 2.5 } }],
        ['a Score with no value', { s: { type: 'score' } }],
        [
          'a Score with out-of-range probabilities',
          { s: { type: 'score', score: 0.8, probabilities: { '0': -1, '1': 2 } } },
        ],
        ['a Noul answer to a Score question', { s: { type: 'noul', noul: 0.5 } }],
        ['a choice with bad probabilities', { c: choice({ a: 2, b: -1 }) }],
      ])('rejects and evicts direct answers with %s', async (_name, bad) => {
        const response = mockResponse({ model: 'drex-max', answers: { ...valid, ...bad } });

        const result = await createProvider({ questions }).callApi('state');

        expect(result.error).toContain('Nace API returned an unexpected response');
        expect(result.output).toBeUndefined();
        expect(response.deleteFromCache).toHaveBeenCalledOnce();
      });
    });
  });
});
