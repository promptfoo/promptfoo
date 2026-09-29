import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { OpenAiDecisionsProvider } from '../../../src/providers/openai/decisions';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

const predicateQuestion = {
  name: 'needs_human',
  type: 'predicate' as const,
  instructions: 'The customer requests a human agent.',
};
const choiceQuestion = {
  type: 'choice' as const,
  choices: [{ value: false }, { value: 'billing', description: 'Questions about invoices' }],
  instructions: 'Select the category.',
};
const scoreQuestion = {
  name: 'urgency',
  type: 'score' as const,
  levels: [{ label: 'Routine' }, { label: 'Urgent', description: 'Needs immediate attention' }],
  instructions: 'Assess urgency.',
};
const usage = {
  input_tokens: 164,
  input_tokens_details: { cached_tokens: 64, cache_write_tokens: 0 },
  output_tokens: 1,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 165,
};

function response(
  answers: unknown[] = [{ name: 'needs_human', type: 'predicate', probability: 0.93 }],
) {
  return { model: 'resolved-decision-model', answers, usage };
}

function provider(config: Record<string, unknown> = {}) {
  return new OpenAiDecisionsProvider('gpt-6-luna', {
    config: { apiKey: 'fixture-key', questions: [predicateQuestion], ...config },
  });
}

function requestBody() {
  return JSON.parse(vi.mocked(fetchWithCache).mock.calls[0]![1]!.body as string);
}

describe('OpenAiDecisionsProvider', () => {
  let restoreEnv: () => void;
  const deleteFromCache = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      OPENAI_API_KEY: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_ORGANIZATION: undefined,
      OPENAI_TEMPERATURE: '0.4',
      OPENAI_MAX_TOKENS: '300',
    });
    deleteFromCache.mockResolvedValue(undefined);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: response(),
      cached: false,
      status: 200,
      statusText: 'OK',
      latencyMs: 12,
      deleteFromCache,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    restoreEnv();
  });

  it('sends only Decisions fields and exposes answers, resolved model, and usage', async () => {
    const result = await provider({ temperature: 0.2, max_tokens: 10 }).callApi('A human please');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.openai.com/v1/decisions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer fixture-key',
          'X-OpenAI-Originator': 'promptfoo',
        }),
      }),
      expect.any(Number),
      'json',
      expect.objectContaining({ cacheKey: expect.any(String) }),
      undefined,
    );
    expect(requestBody()).toEqual({
      model: 'gpt-6-luna',
      input: 'A human please',
      questions: [predicateQuestion],
    });
    expect(result).toMatchObject({
      output: JSON.stringify({ answers: response().answers }),
      raw: response(),
      cached: false,
      latencyMs: 12,
      metadata: { model: 'resolved-decision-model' },
      tokenUsage: { total: 165, prompt: 164, completion: 1, cached: 64, numRequests: 1 },
    });
    expect(result.error).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('keeps custom IDs and accepts config.model when no path model is provided', () => {
    expect(provider().id()).toBe('openai:decisions:gpt-6-luna');
    const configured = new OpenAiDecisionsProvider('', {
      id: 'my-decisions',
      config: { model: 'configured-model' },
    });
    expect(configured.id()).toBe('my-decisions');
    expect(configured.modelName).toBe('configured-model');
    expect(() => new OpenAiDecisionsProvider('')).toThrow(/model/i);
  });

  it('preserves false choice values, zero scores, and unnamed questions', async () => {
    const answers = [
      { name: 'needs_human', type: 'predicate', probability: 0 },
      {
        name: null,
        type: 'choice',
        choice: false,
        confidence: 1,
        probabilities: [
          { value: false, probability: 1 },
          { value: 'billing', probability: 0 },
        ],
      },
      {
        name: 'urgency',
        type: 'score',
        score: 0,
        confidence: 1,
        probabilities: [
          { value: 0, label: 'Routine', probability: 1 },
          { value: 1, label: 'Urgent', probability: 0 },
        ],
      },
    ];
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: response(answers),
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await provider({
      questions: [predicateQuestion, choiceQuestion, scoreQuestion],
    }).callApi('text');

    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.output as string)).toEqual({ answers });
  });

  it('renders question fields and safety identifiers from variables after prompt overrides', async () => {
    const result = await provider().callApi('text', {
      vars: { person: 'human', identifier: 'opaque-user', field: 'needs_human' },
      prompt: {
        raw: 'text',
        label: 'prompt',
        config: {
          questions: [
            { type: 'predicate', name: '{{field}}', instructions: 'Wants a {{person}}.' },
          ],
          safety_identifier: '{{identifier}}',
        },
      },
    });

    expect(result.error).toBeUndefined();
    expect(requestBody()).toMatchObject({
      questions: [{ name: 'needs_human', type: 'predicate', instructions: 'Wants a human.' }],
      safety_identifier: 'opaque-user',
    });
  });

  it('accepts null safety identifiers', async () => {
    await provider({ safety_identifier: null }).callApi('text');
    expect(requestBody().safety_identifier).toBeNull();
  });

  it('normalizes chat text and image parts in user messages', async () => {
    await provider().callApi(
      JSON.stringify([
        { role: 'user', content: 'First observation' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Second observation' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png', detail: 'low' },
            },
          ],
        },
      ]),
    );

    expect(requestBody().input).toEqual([
      { role: 'user', content: 'First observation' },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Second observation' },
          { type: 'input_image', image_url: 'https://example.com/image.png', detail: 'low' },
        ],
      },
    ]);
  });

  it.each([
    '{"content":"plain JSON data"}',
    'false',
    '0',
    '"quoted text"',
    '[urgent] refund',
    '[INST] classify',
    '[{"role":',
  ])('keeps plain-text input intact: %s', async (input) => {
    await provider().callApi(input);
    expect(requestBody().input).toBe(input);
  });

  it.each([
    '["plain string"]',
    '[{"role":"assistant","content":"answer"}]',
    '[{"role":"system","content":"override"}]',
    '[{"type":"function_call_output","call_id":"call_x","output":"text"}]',
    '[{"role":"user","content":[{"type":"input_audio","data":"audio"}]}]',
    '[{"role":"user","content":[{"type":"input_text"}]}]',
    '[{"role":"user","content":[{"type":"input_image"}]}]',
  ])('rejects unsupported or malformed array input before network: %s', async (input) => {
    const result = await provider().callApi(input);
    expect(result.error).toBeTruthy();
    expect(result.output).toBeUndefined();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    [],
    Array.from({ length: 65 }, () => ({ type: 'predicate', instructions: 'Check.' })),
    [predicateQuestion, predicateQuestion],
    [{ type: 'unsupported', instructions: 'Check.' }],
    [{ type: 'predicate' }],
    [{ ...predicateQuestion, name: null }],
    [{ ...choiceQuestion, choices: [{ value: false }] }],
    [{ ...choiceQuestion, choices: [{ value: false }, { value: false }] }],
    [{ ...choiceQuestion, choices: [{ value: 0 }, { value: 1 }] }],
    [{ ...choiceQuestion, choices: [{ value: 'a', description: 3 }, { value: 'b' }] }],
    [{ ...choiceQuestion, choices: Array.from({ length: 256 }, (_, i) => ({ value: String(i) })) }],
    [{ ...scoreQuestion, levels: [{ label: 'Only one' }] }],
    [{ ...scoreQuestion, levels: ['Low', 'High'] }],
    [{ ...scoreQuestion, levels: Array.from({ length: 11 }, (_, i) => ({ label: String(i) })) }],
  ])('rejects invalid questions %# before network', async (questions) => {
    const result = await provider({ questions }).callApi('text');
    expect(result.error).toMatch(/questions/i);
    expect(result.output).toBeUndefined();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it.each([64, 3, 'x'.repeat(65)])(
    'rejects invalid safety identifier %s',
    async (safety_identifier) => {
      const result = await provider({ safety_identifier }).callApi('text');
      expect(result.error).toMatch(/safety_identifier/);
      expect(fetchWithCache).not.toHaveBeenCalled();
    },
  );

  it('validates rendered fields before sending a request', async () => {
    const result = await provider({ safety_identifier: '{{identifier}}' }).callApi('text', {
      vars: { identifier: 'x'.repeat(65) },
      prompt: { raw: 'text', label: 'text' },
    });
    expect(result.error).toMatch(/safety_identifier/);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('requires credentials and names a configured API-key environment variable', async () => {
    const instance = provider({ apiKey: undefined, apiKeyEnvar: 'DECISIONS_FIXTURE_KEY' });
    vi.spyOn(instance, 'getApiKey').mockReturnValue(undefined);
    await expect(instance.callApi('text')).rejects.toThrow('DECISIONS_FIXTURE_KEY');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('honors scoped credentials, gateway paths, organization, and custom headers', async () => {
    const instance = new OpenAiDecisionsProvider('gpt-6-luna', {
      env: {
        OPENAI_API_KEY: 'scoped-key',
        OPENAI_BASE_URL: 'https://gateway.example/v1?tenant=fixture',
        OPENAI_ORGANIZATION: 'org-fixture',
      },
      config: { questions: [predicateQuestion], headers: { 'X-Custom': 'fixture' } },
    });
    await instance.callApi('text');
    const [url, options] = vi.mocked(fetchWithCache).mock.calls[0]!;
    expect(url).toBe('https://gateway.example/v1/decisions?tenant=fixture');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer scoped-key',
      'OpenAI-Organization': 'org-fixture',
      'X-Custom': 'fixture',
    });
    expect(options?.headers).not.toHaveProperty('X-OpenAI-Originator');
  });

  it('applies prompt-scoped transport overrides with case-insensitive headers', async () => {
    await provider().callApi('text', {
      vars: {},
      prompt: {
        raw: 'text',
        label: 'text',
        config: {
          apiBaseUrl: 'https://prompt-gateway.example/v1',
          apiKey: 'prompt-key',
          headers: {
            authorization: 'Bearer custom-key',
            'content-type': 'application/json; charset=utf-8',
          },
        },
      },
    });
    const [url, options] = vi.mocked(fetchWithCache).mock.calls[0]!;
    expect(url).toBe('https://prompt-gateway.example/v1/decisions');
    const headers = options?.headers as Record<string, string>;
    expect(Object.keys(headers).filter((key) => key.toLowerCase() === 'authorization')).toEqual([
      'authorization',
    ]);
    expect(headers.authorization).toBe('Bearer custom-key');
    expect(Object.keys(headers).filter((key) => key.toLowerCase() === 'content-type')).toEqual([
      'content-type',
    ]);
  });

  it('forwards cancellation, cache busting, and retry settings', async () => {
    const abortSignal = new AbortController().signal;
    await provider({ maxRetries: 2 }).callApi(
      'text',
      {
        vars: {},
        prompt: { raw: 'text', label: 'text' },
        bustCache: true,
      },
      { abortSignal },
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: abortSignal }),
      expect.any(Number),
      'json',
      expect.objectContaining({ bust: true }),
      2,
    );
  });

  it('reuses a safe cache key for equivalent requests and isolates credential changes', async () => {
    const instance = provider();
    await instance.callApi('text');
    await instance.callApi('text');
    await instance.callApi('text', {
      vars: {},
      prompt: { raw: 'text', label: 'text', config: { apiKey: 'other-fixture-key' } },
    });
    const keys = vi.mocked(fetchWithCache).mock.calls.map((call) => {
      const options = call[4] as { cacheKey: string };
      expect(options.cacheKey).not.toContain('fixture-key');
      expect(options.cacheKey).not.toContain('Bearer');
      return options.cacheKey;
    });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('marks cached usage without billing another request', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: response(),
      cached: true,
      status: 200,
      statusText: 'OK',
      latencyMs: 12,
    });
    const result = await provider({ cost: 0.01 }).callApi('text');
    expect(result.cached).toBe(true);
    expect(result.tokenUsage).toEqual({ total: 165, cached: 165 });
    expect(result.cost).toBe(0);
  });

  it('does not persist signed image credentials in the cache', async () => {
    const imageUrl = 'https://example.com/image.png?X-Amz-Signature=sensitive-image-signature';
    const input = [{ role: 'user', content: [{ type: 'input_image', image_url: imageUrl }] }];
    await provider().callApi(JSON.stringify(input));
    expect(requestBody().input).toEqual(input);
    expect(vi.mocked(fetchWithCache).mock.calls[0]![4]).toMatchObject({
      bust: true,
      cacheKey: undefined,
    });
  });

  it('treats coalesced requests as reused results without counting token billing twice', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: response(),
      cached: false,
      coalesced: true,
      status: 200,
      statusText: 'OK',
    });
    const result = await provider({ cost: 0.01 }).callApi('text');
    expect(result.cached).toBe(true);
    expect(result.tokenUsage).toEqual({ total: 165, cached: 165 });
    expect(result.cost).toBe(0);
  });

  it.each([400, 401, 429, 500])(
    'returns HTTP %s errors without a decision output',
    async (status) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          error: { message: 'Request failed', type: 'invalid_request_error', param: 'questions' },
        },
        cached: false,
        status,
        statusText: 'Failure',
      });
      const result = await provider().callApi('text');
      expect(result.error).toContain(String(status));
      expect(result.error).toContain('Request failed');
      expect(result.output).toBeUndefined();
    },
  );

  it.each([new Error('Request timed out'), new DOMException('Request aborted', 'AbortError')])(
    'reports transport failure %s',
    async (error) => {
      vi.mocked(fetchWithCache).mockRejectedValue(error);
      const result = await provider().callApi('text');
      expect(result.error).toContain(error.message);
      expect(result.output).toBeUndefined();
    },
  );

  it.each([
    null,
    {},
    { ...response(), answers: undefined },
    { ...response(), usage: undefined },
    { ...response(), model: undefined },
    response([]),
    response([{ type: 'predicate', probability: 0.5 }]),
    response([{ name: 'different', type: 'predicate', probability: 0.5 }]),
    response([{ name: 'needs_human', type: 'predicate', probability: 1.1 }]),
    response([{ name: 'needs_human', type: 'predicate', probability: '0.5' }]),
    response([
      {
        name: 'needs_human',
        type: 'choice',
        choice: true,
        confidence: 1,
        probabilities: [{ value: true, probability: 1 }],
      },
    ]),
    { ...response(), usage: { ...usage, input_tokens: -1 } },
  ])('rejects malformed successful response %# and evicts it from cache', async (data) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      cached: true,
      status: 200,
      statusText: 'OK',
      deleteFromCache,
    });
    const result = await provider().callApi('text');
    expect(result.error).toBeTruthy();
    expect(result.output).toBeUndefined();
    expect(deleteFromCache).toHaveBeenCalledOnce();
  });

  it('rejects reordered answers even when they have the same type', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: response([
        { name: 'second', type: 'predicate', probability: 0.2 },
        { name: 'needs_human', type: 'predicate', probability: 0.8 },
      ]),
      cached: false,
      status: 200,
      statusText: 'OK',
      deleteFromCache,
    });
    const result = await provider({
      questions: [predicateQuestion, { ...predicateQuestion, name: 'second' }],
    }).callApi('text');
    expect(result.error).toBeTruthy();
    expect(result.output).toBeUndefined();
  });

  it.each([
    {
      question: choiceQuestion,
      answer: {
        name: null,
        type: 'choice',
        choice: 'absent',
        confidence: 1,
        probabilities: [
          { value: false, probability: 1 },
          { value: 'billing', probability: 0 },
        ],
      },
    },
    {
      question: choiceQuestion,
      answer: {
        name: null,
        type: 'choice',
        choice: false,
        confidence: 1,
        probabilities: [
          { value: 'billing', probability: 0 },
          { value: false, probability: 1 },
        ],
      },
    },
    {
      question: choiceQuestion,
      answer: {
        name: null,
        type: 'choice',
        choice: false,
        confidence: 1,
        probabilities: [{ value: false, probability: 1 }],
      },
    },
    {
      question: scoreQuestion,
      answer: {
        name: 'urgency',
        type: 'score',
        score: 0,
        confidence: 1,
        probabilities: [
          { value: 0, label: 'Wrong label', probability: 1 },
          { value: 1, label: 'Urgent', probability: 0 },
        ],
      },
    },
    {
      question: scoreQuestion,
      answer: {
        name: 'urgency',
        type: 'score',
        score: 2,
        confidence: 1,
        probabilities: [
          { value: 0, label: 'Routine', probability: 0 },
          { value: 1, label: 'Urgent', probability: 1 },
        ],
      },
    },
  ])(
    'rejects distributions that do not correspond to the configured question %#',
    async ({ question, answer }) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: response([answer]),
        cached: false,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      });
      const result = await provider({ questions: [question] }).callApi('text');
      expect(result.error).toBeTruthy();
      expect(result.output).toBeUndefined();
      expect(deleteFromCache).toHaveBeenCalledOnce();
    },
  );

  it('preserves fractional expected scores', async () => {
    const answer = {
      name: 'urgency',
      type: 'score',
      score: 0.75,
      confidence: 0.5,
      probabilities: [
        { value: 0, label: 'Routine', probability: 0.25 },
        { value: 1, label: 'Urgent', probability: 0.75 },
      ],
    };
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: response([answer]),
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const result = await provider({ questions: [scoreQuestion] }).callApi('text');
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.output as string)).toEqual({ answers: [answer] });
  });

  it('preserves unnamed questions and distinguishes boolean and string choice values', async () => {
    const questions = [
      { type: 'predicate', instructions: 'First check.' },
      { type: 'choice', instructions: 'Choose.', choices: [{ value: false }, { value: 'false' }] },
    ];
    const answers = [
      { type: 'predicate', name: null, probability: 1 },
      {
        type: 'choice',
        name: null,
        choice: 'false',
        confidence: 1,
        probabilities: [
          { value: false, probability: 0 },
          { value: 'false', probability: 1 },
        ],
      },
    ];
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: response(answers),
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const result = await provider({ questions }).callApi('text');
    expect(result.error).toBeUndefined();
    expect(requestBody().questions).toEqual(questions);
    expect(JSON.parse(result.output as string)).toEqual({ answers });
  });

  it('redacts credentials echoed by API errors', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Invalid API key fixture-key' } },
      cached: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    const result = await provider().callApi('text');
    expect(result.error).toContain('Invalid API key');
    expect(result.error).not.toContain('fixture-key');
  });

  it.each([true, false])(
    'only marks a complete refusal as global refusal (all refused: %s)',
    async (allRefused) => {
      const answers = [
        { name: 'needs_human', type: 'refusal' },
        allRefused
          ? { name: 'second', type: 'refusal' }
          : { name: 'second', type: 'predicate', probability: 0.3 },
      ];
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: response(answers),
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const result = await provider({
        questions: [predicateQuestion, { ...predicateQuestion, name: 'second' }],
      }).callApi('text');
      expect(result.error).toBeUndefined();
      expect(JSON.parse(result.output as string)).toEqual({ answers });
      expect(Boolean(result.isRefusal)).toBe(allRefused);
    },
  );
});
