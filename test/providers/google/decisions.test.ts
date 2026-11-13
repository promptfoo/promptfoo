import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GoogleDecisionsProvider } from '../../../src/providers/google/decisions';
import { HttpRateLimitError } from '../../../src/util/fetch/errors';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

const model = 'gemini-decision-1';
const questions = {
  damaged: {
    type: 'noul',
    instructions: 'Was the delivery damaged?',
    criteria: { true_description: 'Physical damage', false_description: 'Undamaged' },
  },
  route: {
    type: 'choice',
    instructions: { type: 'text', text: 'Choose the team.' },
    criteria: { orders: '', delivery: 'Shipping and handling' },
  },
  urgency: {
    type: 'score',
    instructions: [{ type: 'text', text: 'Rate the urgency.' }],
    criteria: ['Routine', 'Urgent'],
  },
};
const answers = {
  damaged: { type: 'noul', noul: 0.99, confidence: 0.99 },
  route: {
    type: 'choice',
    choice: 'delivery',
    probabilities: { orders: 0.1, delivery: 0.9 },
    confidence: 0.9,
  },
  urgency: {
    type: 'score',
    score: 0.75,
    probabilities: { '0': 0.25, '1': 0.75 },
    legend: { '0': 'Routine', '1': 'Urgent' },
    confidence: 0.75,
  },
};
const usage = {
  total_input_tokens: 150,
  input_tokens_by_modality: [{ modality: 'text', tokens: 150 }],
  total_output_tokens: 0,
  total_tokens: 150,
};

function provider(config: Record<string, unknown> = {}) {
  return new GoogleDecisionsProvider(model, {
    config: { apiKey: 'test-key', questions, ...config },
  });
}

const mockFetch = vi.mocked(fetchWithCache);
const ok = { status: 200, statusText: 'OK', cached: false };

describe('GoogleDecisionsProvider', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clearPrefixes: ['GOOGLE_', 'GEMINI_', 'PALM_', 'VERTEX_'] });
    mockFetch.mockReset().mockResolvedValue({ ...ok, data: { answers, usage } });
  });

  afterEach(() => {
    mockFetch.mockReset();
    restoreEnv();
  });

  it('sends a single native request for all question types and exposes the answers by key', async () => {
    const input = 'The glass arrived in pieces.';
    const result = await provider().callApi(input);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(request?.method).toBe('POST');
    const headers = new Headers(request?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-goog-api-key')).toBe('test-key');
    expect(JSON.parse(request?.body as string)).toEqual({ model, questions, input });
    expect(result).toMatchObject({
      output: answers,
      tokenUsage: { prompt: 150, completion: 0, total: 150, numRequests: 1 },
    });
    expect(result.cost).toBeCloseTo((150 * 0.1) / 1e6, 12);
  });

  it.each([
    { input: { type: 'document', mime_type: 'application/pdf', data: 'JVBERi0=' } },
    {
      input: [
        { type: 'text', text: 'Review this delivery.' },
        { type: 'image', mime_type: 'image/png', uri: 'https://example.com/photo.png' },
      ],
    },
  ])('sends JSON-encoded native content as structured input: $input', async ({ input }) => {
    await provider().callApi(JSON.stringify(input));
    expect(JSON.parse(mockFetch.mock.calls[0][1]?.body as string).input).toEqual(input);
  });

  it('sends an image file var, which promptfoo loads as a data URL, as raw base64', async () => {
    const blocks = [
      { type: 'text', text: 'Review this delivery.' },
      { type: 'image', data: 'data:image/png;base64,iVBORw0KGgo=' },
      { type: 'image', mime_type: 'image/webp', data: 'data:image/png;base64,UklGRg==' },
    ];
    await provider().callApi(JSON.stringify(blocks));
    expect(JSON.parse(mockFetch.mock.calls[0][1]?.body as string).input).toEqual([
      blocks[0],
      { type: 'image', mime_type: 'image/png', data: 'iVBORw0KGgo=' },
      { type: 'image', mime_type: 'image/webp', data: 'UklGRg==' },
    ]);

    await provider().callApi(JSON.stringify(blocks[1]));
    expect(JSON.parse(mockFetch.mock.calls[1][1]?.body as string).input).toEqual({
      type: 'image',
      mime_type: 'image/png',
      data: 'iVBORw0KGgo=',
    });
  });

  it.each([
    '{"customer":"example","order":3}',
    '{"type":"text","score":1}',
    '[{"type":"image","label":"broken"}]',
  ])('preserves ordinary JSON as the text being classified: %s', async (input) => {
    await provider().callApi(input);
    expect(JSON.parse(mockFetch.mock.calls[0][1]?.body as string).input).toBe(input);
  });

  it('preserves user-defined keys in questions, criteria, and answers', async () => {
    const namedQuestion = {
      ['__proto__']: {
        type: 'choice',
        instructions: 'Choose a label.',
        criteria: { ['__proto__']: '', café: '' },
      },
    };
    const namedAnswer = {
      ['__proto__']: {
        type: 'choice',
        choice: '__proto__',
        probabilities: { ['__proto__']: 0.8, café: 0.2 },
        confidence: 0.8,
      },
    };
    mockFetch.mockResolvedValue({ ...ok, data: { answers: namedAnswer, usage } });
    const result = await provider({ questions: namedQuestion }).callApi('text');
    expect(JSON.parse(mockFetch.mock.calls[0][1]?.body as string).questions).toEqual(namedQuestion);
    expect(result.output).toEqual(namedAnswer);
  });

  it('uses a scoped Gemini key and forwards caller cancellation to transport', async () => {
    const instance = new GoogleDecisionsProvider(model, {
      config: { questions },
      env: { GEMINI_API_KEY: 'scoped-key', VERTEX_API_KEY: 'vertex-only' },
    });
    const abortSignal = new AbortController().signal;
    await instance.callApi('text', undefined, { abortSignal });
    const [, request] = mockFetch.mock.calls[0];
    expect(new Headers(request?.headers).get('x-goog-api-key')).toBe('scoped-key');
    expect(request?.signal).toBe(abortSignal);
  });

  it('requires native Gemini credentials', async () => {
    const instance = new GoogleDecisionsProvider(model, {
      config: { questions },
      env: { VERTEX_API_KEY: 'vertex-only' },
    });
    const result = await instance.callApi('text');
    expect(result.error).toMatch(/key/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { 'invalid key': questions.damaged },
    { rating: { type: 'score', instructions: 'Rate this.', criteria: ['Only level'] } },
    { category: { type: 'choice', instructions: 'Pick one.' } },
  ])('reports invalid question configuration before transport: %j', async (invalid) => {
    const result = await provider({ questions: invalid }).callApi('text');
    expect(result.error).toMatch(/question|criteria/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    {},
    { ...answers, damaged: answers.urgency },
    { ...answers, route: { ...answers.route, choice: 'unknown' } },
    { ...answers, route: { ...answers.route, probabilities: { orders: -0.1, delivery: 0.9 } } },
    { ...answers, urgency: { ...answers.urgency, score: 2 } },
    { ...answers, urgency: { ...answers.urgency, legend: { 0: 'Swapped', 1: 'Routine' } } },
  ])('rejects responses missing the requested typed answers: %j', async (invalidAnswers) => {
    mockFetch.mockResolvedValue({ ...ok, data: { answers: invalidAnswers, usage } });
    const result = await provider().callApi('text');
    expect(result.error).toMatch(/answer|response/i);
    expect(result.output).toBeUndefined();
  });

  it.each([
    [400, 'Request blocked due to safety violations'],
    [429, 'Quota exceeded'],
    [503, 'Service unavailable'],
  ] as const)('surfaces the server message for HTTP %i', async (status, message) => {
    mockFetch.mockResolvedValue({
      status,
      statusText: 'Error',
      cached: false,
      data: { error: { message } },
    });
    const result = await provider().callApi('text');
    expect(result.error).toContain(String(status));
    expect(result.error).toContain(message);
    expect(result.output).toBeUndefined();
  });

  it('reports a transport timeout as an evaluation error', async () => {
    mockFetch.mockRejectedValue(new Error('Request timed out'));
    const result = await provider().callApi('text');
    expect(result.error).toMatch(/timed out/i);
    expect(result.output).toBeUndefined();
  });

  it('preserves retry timing when transport exhausts the rate limit', async () => {
    mockFetch.mockRejectedValue(
      new HttpRateLimitError({ status: 429, statusText: 'Too Many Requests', retryAfterMs: 1250 }),
    );
    const result = await provider().callApi('text');
    expect(result.error).toContain('HTTP 429');
    expect(result.metadata?.http).toMatchObject({
      status: 429,
      headers: { 'retry-after-ms': '1250' },
    });
  });
});
