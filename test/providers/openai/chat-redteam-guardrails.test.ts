import { disableCache, fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

jest.mock('../../../src/cache');

const mockFetchWithCache = jest.mocked(fetchWithCache);

describe('OpenAI Chat Provider - Redteam Guardrails', () => {
  const baseContext = {
    prompt: { raw: 'Test prompt', label: 'test' },
    vars: {},
  };

  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
    cliState.config = undefined;
  });

  afterEach(() => {
    cliState.config = undefined;
  });

  describe('Content Filtering in Redteam Context', () => {
    beforeEach(() => {
      cliState.config = { redteam: {} };
    });

    it('should capture content_filter finish_reason as guardrails for reasoning models', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          choices: [
            {
              message: { content: 'Filtered' },
              finish_reason: 'content_filter',
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
      });

      const provider = new OpenAiChatCompletionProvider('o3-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test' }]),
        baseContext,
      );

      expect(result).toMatchObject({
        output: 'Filtered',
        guardrails: { flagged: true, flaggedOutput: true },
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    it('should NOT capture content_filter as guardrails for non-reasoning models', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          choices: [
            {
              message: { content: 'Response' },
              finish_reason: 'content_filter',
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
      });

      const provider = new OpenAiChatCompletionProvider('gpt-4o');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test' }]),
        baseContext,
      );

      expect(result.guardrails).toBeUndefined();
      expect(result.output).toBe('Response');
    });

    it('should capture content_filter for codex-mini-latest as a reasoning model', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          choices: [
            {
              message: { content: 'Response' },
              finish_reason: 'content_filter',
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
      });

      const provider = new OpenAiChatCompletionProvider('codex-mini-latest');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test' }]),
        baseContext,
      );

      expect(result).toMatchObject({
        output: 'Response',
        guardrails: { flagged: true, flaggedOutput: true },
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    it('should capture content_policy_violation errors as guardrails for all models', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          error: {
            code: 'content_policy_violation',
            message: 'Policy violation',
          },
        },
        cached: false,
        status: 200,
      });

      // Test with non-reasoning model
      const provider = new OpenAiChatCompletionProvider('gpt-4o');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test' }]),
        baseContext,
      );

      expect(result).toMatchObject({
        error: expect.stringContaining('content_policy_violation'),
        guardrails: { flagged: true, flaggedInput: true },
      });
    });

    it('should preserve all metadata with guardrails', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          choices: [
            {
              message: { content: 'Content' },
              finish_reason: 'content_filter',
            },
          ],
          usage: { total_tokens: 100, prompt_tokens: 80, completion_tokens: 20 },
          model: 'o3-mini',
        },
        cached: true,
        status: 200,
      });

      const provider = new OpenAiChatCompletionProvider('o3-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test' }]),
        baseContext,
      );

      expect(result.guardrails).toEqual({ flagged: true, flaggedOutput: true });
      expect(result.tokenUsage).toEqual({ total: 100, cached: 100 });
      expect(result.cached).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.raw).toBeDefined();
    });
  });

  describe('Non-Redteam Context', () => {
    beforeEach(() => {
      cliState.config = {};
    });

    it('should NOT capture guardrails outside redteam context', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          choices: [
            {
              message: { content: 'Normal response' },
              finish_reason: 'content_filter',
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
      });

      const provider = new OpenAiChatCompletionProvider('o3-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test' }]),
        baseContext,
      );

      expect(result.guardrails).toBeUndefined();
      expect(result.output).toBe('Normal response');
    });

    it('should treat content_policy_violation as regular error', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          error: {
            code: 'content_policy_violation',
            message: 'Policy violation',
          },
        },
        cached: false,
        status: 200,
      });

      const provider = new OpenAiChatCompletionProvider('gpt-4o');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test' }]),
        baseContext,
      );

      expect(result.guardrails).toBeUndefined();
      expect(result.error).toContain('content_policy_violation');
    });
  });
});
