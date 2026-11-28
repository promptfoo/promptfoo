const { createLoggerModule } = await vi.hoisted(async () => import('../../factories/logger'));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GroqProvider } from '../../../src/providers/groq/index';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../../src/logger', () => createLoggerModule());

// Shapes match live Groq Chat Completions responses for these models.
const qwenParsedReasoningResponse = ({ includeReasoning = true } = {}) =>
  createMockFetchResponse({
    model: 'qwen/qwen3.8-27b',
    choices: [
      {
        message: {
          role: 'assistant',
          content: '391',
          ...(includeReasoning ? { reasoning: '17 * 23 = 340 + 51 = 391' } : {}),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 55,
      completion_tokens: 62,
      total_tokens: 117,
      completion_tokens_details: { reasoning_tokens: 56 },
    },
  });

function sentBody(): Record<string, unknown> {
  const [, init] = vi.mocked(fetchWithCache).mock.calls[0] ?? [];
  return JSON.parse((init as RequestInit).body as string);
}

describe('Groq current catalog models', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      GROQ_API_KEY: 'test-key',
      OPENAI_MAX_TOKENS: undefined,
      OPENAI_MAX_COMPLETION_TOKENS: undefined,
      OPENAI_TEMPERATURE: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('qwen/qwen3.8-27b', () => {
    it('forwards reasoning_effort and prefixes parsed reasoning to the output', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(qwenParsedReasoningResponse());
      const provider = new GroqProvider('qwen/qwen3.8-27b', {
        config: { reasoning_effort: 'low' },
      });

      const result = await provider.callApi('What is 17*23?');

      expect(vi.mocked(fetchWithCache).mock.calls[0]?.[0]).toBe(
        'https://api.groq.com/openai/v1/chat/completions',
      );
      const body = sentBody();
      expect(body).toMatchObject({
        model: 'qwen/qwen3.8-27b',
        reasoning_effort: 'low',
        temperature: 0,
      });
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('max_completion_tokens');
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Thinking: 17 * 23 = 340 + 51 = 391\n\n391');
      expect(result.tokenUsage).toMatchObject({
        prompt: 55,
        completion: 62,
        total: 117,
        completionDetails: { reasoning: 56 },
      });
      // Promptfoo has no built-in Groq prices.
      expect(result.cost).toBeUndefined();
    });

    it('returns only the answer when showThinking is false', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(qwenParsedReasoningResponse());
      const provider = new GroqProvider('qwen/qwen3.8-27b', {
        config: { reasoning_effort: 'low', showThinking: false },
      });

      expect((await provider.callApi('What is 17*23?')).output).toBe('391');
    });

    it('prices responses with explicit inputCost and outputCost', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        qwenParsedReasoningResponse({ includeReasoning: false }),
      );
      const provider = new GroqProvider('qwen/qwen3.8-27b', {
        config: {
          reasoning_effort: 'low',
          include_reasoning: false,
          inputCost: 0.8 / 1e6,
          outputCost: 4 / 1e6,
        },
      });

      const result = await provider.callApi('What is 17*23?');

      expect(sentBody()).toMatchObject({ include_reasoning: false, reasoning_effort: 'low' });
      expect(result.output).toBe('391');
      expect(result.cost).toBeCloseTo(55 * (0.8 / 1e6) + 62 * (4 / 1e6), 12);
    });

    it('surfaces Groq rejections of unsupported reasoning efforts', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse(
          {
            error: {
              message: 'invalid Qwen3.8 reasoning_effort',
              type: 'invalid_request_error',
            },
          },
          { status: 400, statusText: 'Bad Request' },
        ),
      );
      const provider = new GroqProvider('qwen/qwen3.8-27b', {
        config: { reasoning_effort: 'xhigh' },
      });

      const result = await provider.callApi('What is 17*23?');

      expect(sentBody()).toMatchObject({ reasoning_effort: 'xhigh' });
      expect(result.error).toContain('API error: 400 Bad Request');
      expect(result.error).toContain('invalid Qwen3.8 reasoning_effort');
    });
  });

  describe('meta-models/muse-spark-open', () => {
    it('sends reasoning_effort and max_completion_tokens', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [
            {
              message: { role: 'assistant', content: '391', reasoning: 'Multiply.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
        }),
      );
      const provider = new GroqProvider('meta-models/muse-spark-open', {
        config: { reasoning_effort: 'xhigh', max_tokens: 2000 },
      });

      const result = await provider.callApi('What is 17*23?');

      const body = sentBody();
      expect(body).toMatchObject({
        model: 'meta-models/muse-spark-open',
        reasoning_effort: 'xhigh',
        max_completion_tokens: 2000,
      });
      expect(body).not.toHaveProperty('max_tokens');
      expect(result.output).toBe('Thinking: Multiply.\n\n391');
    });

    it('surfaces access errors for accounts without the model', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse(
          {
            error: {
              message: 'The model `meta-models/muse-spark-open` requires terms acceptance.',
              type: 'invalid_request_error',
              code: 'model_terms_required',
            },
          },
          { status: 400, statusText: 'Bad Request' },
        ),
      );
      const provider = new GroqProvider('meta-models/muse-spark-open', {
        config: { reasoning_effort: 'low' },
      });

      const result = await provider.callApi('What is 17*23?');

      expect(result.output).toBeUndefined();
      expect(result.error).toContain('API error: 400 Bad Request');
      expect(result.error).toContain('requires terms acceptance');
    });
  });

  describe('allam-2-7b', () => {
    it('uses the standard chat request shape without reasoning parameters', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [{ message: { role: 'assistant', content: '391 ' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 22, completion_tokens: 6, total_tokens: 28 },
        }),
      );
      // Groq rejects reasoning_effort for this model, so it must not reach the wire.
      const provider = new GroqProvider('allam-2-7b', { config: { reasoning_effort: 'low' } });

      const result = await provider.callApi('What is 17*23?');

      const body = sentBody();
      expect(body).toMatchObject({ model: 'allam-2-7b', max_tokens: 1024, temperature: 0 });
      expect(body).not.toHaveProperty('reasoning_effort');
      expect(body).not.toHaveProperty('max_completion_tokens');
      expect(result.output).toBe('391 ');
      expect(result.tokenUsage).toMatchObject({ prompt: 22, completion: 6, total: 28 });
    });
  });
});
