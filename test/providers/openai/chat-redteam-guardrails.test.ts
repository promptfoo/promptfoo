import { disableCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

jest.mock('../../../src/cache');

const { fetchWithCache } = require('../../../src/cache');
const mockFetchWithCache = jest.mocked(fetchWithCache);

describe('OpenAI Chat Provider - Redteam Guardrails', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
    // Reset cliState before each test
    cliState.config = undefined;
  });

  afterEach(() => {
    // Clean up cliState after each test
    cliState.config = undefined;
  });

  describe('Content Filter Finish Reason', () => {
    it('should return guardrails response when content_filter finish_reason is present in redteam context', async () => {
      // Set redteam config
      cliState.config = { redteam: {} };
      
      const mockResponse = {
        data: {
          choices: [
            { 
              message: { content: 'Content was filtered' },
              finish_reason: 'content_filter'
            }
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
        {
          prompt: { raw: 'Test prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedOutput: true,
      });
      expect(result.output).toBe('Content was filtered');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
      expect(result.raw).toBeDefined();
    });

    it('should return guardrails response when detecting redteam via config', async () => {
      // Set redteam config
      cliState.config = { redteam: { plugins: ['harmful'] } };
      
      const mockResponse = {
        data: {
          choices: [
            { 
              message: { content: null },
              finish_reason: 'content_filter'
            }
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
        {
          prompt: { raw: 'Test prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedOutput: true,
      });
      expect(result.output).toBe('Content was filtered by OpenAI');
    });

    it('should NOT return guardrails when content_filter is present but NOT in redteam context', async () => {
      // No redteam config
      cliState.config = {};
      
      const mockResponse = {
        data: {
          choices: [
            { 
              message: { content: 'Regular filtered content' },
              finish_reason: 'content_filter'
            }
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
        {
          prompt: { raw: 'Test prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toBeUndefined();
      expect(result.output).toBe('Regular filtered content');
    });

    it('should handle multiple choices with mixed finish_reasons in redteam', async () => {
      // Set redteam config
      cliState.config = { redteam: { strategies: ['jailbreak'] } };
      
      const mockResponse = {
        data: {
          choices: [
            { 
              message: { content: 'Normal response' },
              finish_reason: 'stop'
            },
            { 
              message: { content: 'Filtered response' },
              finish_reason: 'content_filter'
            }
          ],
          usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
        {
          prompt: { raw: 'Test prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedOutput: true,
      });
      // Should use first choice's content
      expect(result.output).toBe('Normal response');
    });
  });

  describe('Content Policy Violation Errors', () => {
    it('should return guardrails response for content_policy_violation error in redteam context', async () => {
      // Set redteam config
      cliState.config = { redteam: {} };
      
      const mockResponse = {
        data: {
          error: {
            code: 'content_policy_violation',
            message: 'The prompt violated content policies',
            type: 'invalid_request_error',
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Inappropriate prompt' }]),
        {
          prompt: { raw: 'Inappropriate prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedInput: true,
      });
      expect(result.error).toContain('content_policy_violation');
      expect(result.error).toContain('The prompt violated content policies');
      expect(result.raw).toBeDefined();
    });

    it('should NOT return guardrails for content_policy_violation error when NOT in redteam context', async () => {
      // No redteam config
      cliState.config = {};
      
      const mockResponse = {
        data: {
          error: {
            code: 'content_policy_violation',
            message: 'The prompt violated content policies',
            type: 'invalid_request_error',
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Inappropriate prompt' }]),
        {
          prompt: { raw: 'Inappropriate prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toBeUndefined();
      expect(result.error).toContain('content_policy_violation');
    });

    it('should handle other error types normally in redteam context', async () => {
      // Set redteam config
      cliState.config = { redteam: {} };
      
      const mockResponse = {
        data: {
          error: {
            code: 'rate_limit_exceeded',
            message: 'Rate limit exceeded',
            type: 'rate_limit_error',
          },
        },
        cached: false,
        status: 429,
        statusText: 'Too Many Requests',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
        {
          prompt: { raw: 'Test prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toBeUndefined();
      expect(result.error).toContain('rate_limit_exceeded');
    });
  });

  describe('Cost and Token Usage Preservation', () => {
    it('should preserve all metadata when returning guardrails response', async () => {
      // Set redteam config
      cliState.config = { redteam: {} };
      
      const mockResponse = {
        data: {
          choices: [
            { 
              message: { content: 'Filtered content' },
              finish_reason: 'content_filter'
            }
          ],
          usage: {
            total_tokens: 100,
            prompt_tokens: 80,
            completion_tokens: 20,
          },
          model: 'gpt-4o-mini',
        },
        cached: true,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
        {
          prompt: { raw: 'Test prompt', label: 'test' },
          vars: {},
        },
      );

      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedOutput: true,
      });
      expect(result.tokenUsage).toEqual({
        total: 100,
        cached: 100,
      });
      expect(result.cached).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.raw).toEqual(mockResponse.data);
    });
  });
}); 