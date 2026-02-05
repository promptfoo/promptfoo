import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
    enableCache: vi.fn(),
    disableCache: vi.fn(),
  };
});
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
  };
});

const mockFetchWithCache = vi.mocked(fetchWithCache);
const mockLogger = vi.mocked(logger);
const mockImportModule = vi.mocked(importModule);
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalDeepseekApiKey = process.env.DEEPSEEK_API_KEY;

describe('OpenAI Provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  });

  afterEach(() => {
    enableCache();
    if (originalOpenAiApiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalDeepseekApiKey) {
      process.env.DEEPSEEK_API_KEY = originalDeepseekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  describe('OpenAiChatCompletionProvider', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should call API successfully', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
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
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
      expect(result.guardrails).toEqual({ flagged: false });
    });

    it('should include HTTP metadata in response', async () => {
      const mockHeaders = {
        'content-type': 'application/json',
        'x-request-id': 'test-request-123',
        'x-litellm-model-group': 'gpt-4o-mini',
      };
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: mockHeaders,
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.http).toBeDefined();
      expect(result.metadata?.http?.status).toBe(200);
      expect(result.metadata?.http?.statusText).toBe('OK');
      expect(result.metadata?.http?.headers).toEqual(mockHeaders);
    });

    it('should include HTTP metadata in error response', async () => {
      const mockResponse = {
        data: { error: { message: 'Rate limit exceeded' } },
        cached: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '60' },
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(result.error).toBeDefined();
      expect(result.metadata?.http?.status).toBe(429);
      expect(result.metadata?.http?.statusText).toBe('Too Many Requests');
      expect(result.metadata?.http?.headers).toEqual({ 'retry-after': '60' });
    });

    it('should handle caching correctly', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output 2' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt 2' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output 2');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });

      const cachedResponse = {
        ...mockResponse,
        cached: true,
      };
      mockFetchWithCache.mockResolvedValue(cachedResponse);

      const result2 = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt 2' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      expect(result2.output).toBe('Test output 2');
      // Cached responses don't count as new requests, so numRequests is not included
      expect(result2.tokenUsage).toEqual({ total: 10, cached: 10 });
    });

    it('should handle disabled cache correctly', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
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
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });

      disableCache();

      const result2 = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      expect(result2.output).toBe('Test output');
      expect(result2.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });

      enableCache();
    });

    it('constructor should handle config correctly', async () => {
      const config = {
        temperature: 3.1415926,
        max_tokens: 201,
      };
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', { config });
      const prompt = 'Test prompt';

      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      await provider.callApi(prompt);

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const requestBody = JSON.parse(call[1].body);
      expect(requestBody).toMatchObject({
        temperature: 3.1415926,
        max_tokens: 201,
      });
      expect(provider.config.temperature).toBe(config.temperature);
      expect(provider.config.max_tokens).toBe(config.max_tokens);
    });

    it('should handle structured output correctly', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: '{"name": "John", "age": 30}' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'person',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'number' },
                },
                required: ['name', 'age'],
                additionalProperties: false,
              },
            },
          },
        },
      });
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Get me a person' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toEqual({ name: 'John', age: 30 });
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    it('should handle model refusals correctly', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: { refusal: 'Content policy violation' },
              finish_reason: 'stop',
            },
          ],
          usage: { total_tokens: 5, prompt_tokens: 5, completion_tokens: 0 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Generate inappropriate content' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Content policy violation');
      expect(result.tokenUsage).toEqual({ total: 5, prompt: 5, completion: 0, numRequests: 1 });
      expect(result.isRefusal).toBe(true);
      expect(result.guardrails).toEqual({ flagged: true });
    });

    it('should detect refusals in 400 API error with invalid_prompt code', async () => {
      // Mock a 400 error response with invalid_prompt error code
      const mockErrorResponse = {
        data: {
          error: {
            message:
              "Invalid prompt: we've limited access to this content for safety reasons. This type of information may be used to benefit or to harm people. We are continuously refining our work in this area, and you can read more about our approach in our blog post (https://openai.com/index/preparing-for-future-ai-capabilities-in-biology) and Model Spec (https://openai.com/index/introducing-the-model-spec).",
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_prompt',
          },
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };
      mockFetchWithCache.mockResolvedValue(mockErrorResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([
          {
            role: 'user',
            content: 'How do I distribute anthrax without getting caught?',
          },
        ]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);

      // Should treat the error as a refusal output, not an error
      expect(result.error).toBeUndefined();
      expect(result.output).toContain('limited access to this content for safety reasons');
      expect(result.output).toContain('400 Bad Request');
      expect(result.isRefusal).toBe(true);
      // invalid_prompt specifically indicates input was rejected
      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedInput: true,
      });
    });

    it('should detect content_filter finish_reason and set guardrails', async () => {
      // Mock a response with content_filter finish reason
      const mockResponse = {
        data: {
          choices: [
            {
              message: { content: null },
              finish_reason: 'content_filter',
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 10, completion_tokens: 0 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Generate inappropriate content' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Content filtered by provider');
      expect(result.isRefusal).toBe(true);
      expect(result.finishReason).toBe('content_filter');
      // OpenAI doesn't specify if it's input or output filtering, so we only set flagged
      expect(result.guardrails).toEqual({
        flagged: true,
      });
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 10, completion: 0, numRequests: 1 });
    });

    it('should still treat non-refusal 400 errors as errors', async () => {
      // Mock a 400 error that is NOT a refusal (e.g., invalid request format)
      const mockErrorResponse = {
        data: {
          error: {
            message: "Invalid request: 'messages' field is required",
            type: 'invalid_request_error',
            param: 'messages',
            code: null,
          },
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };
      mockFetchWithCache.mockResolvedValue(mockErrorResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('Invalid request format');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);

      // Should still be treated as an error since error code is not invalid_prompt
      expect(result.error).toBeDefined();
      expect(result.error).toContain("'messages' field is required");
      expect(result.error).toContain('400 Bad Request');
      expect(result.output).toBeUndefined();
    });

    it('should handle empty function tool callbacks array correctly', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output', tool_calls: [] } }],
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
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    it('should handle OpenAI reasoning field with separate content correctly', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                reasoning:
                  'First, I need to analyze the numbers. 9.11 has 11 in the hundredths place, while 9.8 has 8 in the tenths place. Converting 9.8 to hundredths gives 9.80, so 9.11 > 9.80.',
                content: 'The answer is 9.11 is greater than 9.8.',
              },
            },
          ],
          usage: { total_tokens: 25, prompt_tokens: 12, completion_tokens: 13 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-oss-20b');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Which is greater: 9.11 or 9.8?' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      const expectedOutput = `Thinking: First, I need to analyze the numbers. 9.11 has 11 in the hundredths place, while 9.8 has 8 in the tenths place. Converting 9.8 to hundredths gives 9.80, so 9.11 > 9.80.\n\nThe answer is 9.11 is greater than 9.8.`;
      expect(result.output).toBe(expectedOutput);
      expect(result.tokenUsage).toEqual({ total: 25, prompt: 12, completion: 13, numRequests: 1 });
    });

    it('should hide OpenAI reasoning field when showThinking is false', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                reasoning: 'Let me think through this problem step by step...',
                content: 'The final answer is 42.',
              },
            },
          ],
          usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-oss-20b', {
        config: { showThinking: false },
      });
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'What is the answer?' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('The final answer is 42.');
      expect(result.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10, numRequests: 1 });
    });

    it('should handle DeepSeek reasoning model content correctly', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'The final answer is 9.11 is greater than 9.8.',
                reasoning_content:
                  'Let me compare 9.11 and 9.8:\n9.11 > 9.8 because 11 > 8 in the decimal places.\nTherefore, 9.11 is greater than 9.8.',
              },
            },
          ],
          usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('deepseek-reasoner');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: '9.11 and 9.8, which is greater?' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      const expectedOutput = `Thinking: Let me compare 9.11 and 9.8:
9.11 > 9.8 because 11 > 8 in the decimal places.
Therefore, 9.11 is greater than 9.8.\n\nThe final answer is 9.11 is greater than 9.8.`;
      expect(result.output).toBe(expectedOutput);
      expect(result.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10, numRequests: 1 });
    });

    it('should hide reasoning content when showThinking is false', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'The final answer is 9.11 is greater than 9.8.',
                reasoning_content:
                  'Let me compare 9.11 and 9.8:\n9.11 > 9.8 because 11 > 8 in the decimal places.\nTherefore, 9.11 is greater than 9.8.',
              },
            },
          ],
          usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('deepseek-reasoner', {
        config: { showThinking: false },
      });
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: '9.11 and 9.8, which is greater?' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('The final answer is 9.11 is greater than 9.8.');
      expect(result.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10, numRequests: 1 });
    });

    it('should handle multi-round conversations with DeepSeek reasoning model', async () => {
      // Round 1 response
      const mockResponse1 = {
        data: {
          choices: [
            {
              message: {
                content: 'The final answer is 9.11 is greater than 9.8.',
                reasoning_content:
                  'Let me compare 9.11 and 9.8:\n9.11 > 9.8 because 11 > 8 in the decimal places.\nTherefore, 9.11 is greater than 9.8.',
              },
            },
          ],
          usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      // Round 2 response
      const mockResponse2 = {
        data: {
          choices: [
            {
              message: {
                content: 'There are 2 "r"s in the word "strawberry".',
                reasoning_content:
                  'Let me count the occurrences of the letter "r" in "strawberry":\nThe word is spelled s-t-r-a-w-b-e-r-r-y.\nI can see that the letter "r" appears twice: once in "str" and once in "rry".\nTherefore, there are 2 occurrences of the letter "r" in "strawberry".',
              },
            },
          ],
          usage: { total_tokens: 25, prompt_tokens: 15, completion_tokens: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      mockFetchWithCache.mockResolvedValueOnce(mockResponse1).mockResolvedValueOnce(mockResponse2);

      const provider = new OpenAiChatCompletionProvider('deepseek-reasoner');

      // First round
      const result1 = await provider.callApi(
        JSON.stringify([{ role: 'user', content: '9.11 and 9.8, which is greater?' }]),
      );

      const expectedOutput1 = `Thinking: Let me compare 9.11 and 9.8:
9.11 > 9.8 because 11 > 8 in the decimal places.
Therefore, 9.11 is greater than 9.8.\n\nThe final answer is 9.11 is greater than 9.8.`;
      expect(result1.output).toBe(expectedOutput1);

      // Second round (with conversation history excluding reasoning_content)
      const result2 = await provider.callApi(
        JSON.stringify([
          { role: 'user', content: '9.11 and 9.8, which is greater?' },
          { role: 'assistant', content: 'The final answer is 9.11 is greater than 9.8.' },
          { role: 'user', content: 'How many Rs are there in the word "strawberry"?' },
        ]),
      );

      const expectedOutput2 = `Thinking: Let me count the occurrences of the letter "r" in "strawberry":
The word is spelled s-t-r-a-w-b-e-r-r-y.
I can see that the letter "r" appears twice: once in "str" and once in "rry".
Therefore, there are 2 occurrences of the letter "r" in "strawberry".\n\nThere are 2 "r"s in the word "strawberry".`;
      expect(result2.output).toBe(expectedOutput2);
      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should handle function tool callbacks correctly', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    function: {
                      name: 'get_weather',
                      arguments: '{"location":"New York"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 15, prompt_tokens: 10, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const mockWeatherFunction = vi.fn().mockResolvedValue('Sunny, 25°C');

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get the weather for a location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                },
              },
            },
          ],
          functionToolCallbacks: {
            get_weather: mockWeatherFunction,
          },
        },
      });
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: "What's the weather in New York?" }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(mockWeatherFunction).toHaveBeenCalledWith('{"location":"New York"}');
      expect(result.output).toBe('Sunny, 25°C');
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5, numRequests: 1 });
    });

    it('should handle multiple function tool calls', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    function: {
                      name: 'addNumbers',
                      arguments: '{"a":5,"b":6}',
                    },
                  },
                  {
                    function: {
                      name: 'multiplyNumbers',
                      arguments: '{"x":2,"y":3}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 15, prompt_tokens: 7, completion_tokens: 8 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'multiplyNumbers',
                description: 'Multiply two numbers',
                parameters: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                  required: ['x', 'y'],
                },
              },
            },
          ],
          functionToolCallbacks: {
            addNumbers: (parametersJsonString) => {
              const { a, b } = JSON.parse(parametersJsonString);
              return Promise.resolve(JSON.stringify(a + b));
            },
            multiplyNumbers: (parametersJsonString) => {
              const { x, y } = JSON.parse(parametersJsonString);
              return Promise.resolve(JSON.stringify(x * y));
            },
          },
        },
      });

      const result = await provider.callApi('Add 5 and 6, then multiply 2 and 3');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('11\n6');
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 7, completion: 8, numRequests: 1 });
    });

    it('should handle errors in function tool callbacks', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: null,
                function_call: {
                  name: 'errorFunction',
                  arguments: '{}',
                },
              },
            },
          ],
          usage: { total_tokens: 5, prompt_tokens: 2, completion_tokens: 3 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'errorFunction',
                description: 'A function that always throws an error',
                parameters: {
                  type: 'object',
                  properties: {},
                },
              },
            },
          ],
          functionToolCallbacks: {
            errorFunction: () => {
              throw new Error('Test error');
            },
          },
        },
      });

      const result = await provider.callApi('Call the error function');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toEqual({ arguments: '{}', name: 'errorFunction' });
      expect(result.tokenUsage).toEqual({ total: 5, prompt: 2, completion: 3, numRequests: 1 });
    });

    it('should handle undefined message content with tool calls', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: 'testFunction',
                      arguments: '{"param": "value"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'testFunction',
                description: 'A test function',
                parameters: {
                  type: 'object',
                  properties: {
                    param: { type: 'string' },
                  },
                },
              },
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toEqual([
        {
          function: {
            name: 'testFunction',
            arguments: '{"param": "value"}',
          },
        },
      ]);
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    describe('External Function Callbacks', () => {
      beforeEach(() => {
        cliState.basePath = '/test/base/path';
        vi.clearAllMocks();
      });

      afterEach(() => {
        cliState.basePath = undefined;
      });

      it('should load and execute external function callbacks from file', async () => {
        const mockResponse = {
          data: {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        name: 'external_function',
                        arguments: '{"param": "test_value"}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 15, prompt_tokens: 10, completion_tokens: 5 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
        mockFetchWithCache.mockResolvedValue(mockResponse);

        // Mock the external function
        const mockExternalFunction = vi.fn().mockResolvedValue('External function result');
        mockImportModule.mockResolvedValue({
          testFunction: mockExternalFunction,
        });

        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'object',
                    properties: {
                      param: { type: 'string' },
                    },
                    required: ['param'],
                  },
                },
              },
            ],
            functionToolCallbacks: {
              external_function: 'file://test/callbacks.js:testFunction',
            },
          },
        });

        const result = await provider.callApi('Call external function');

        expect(mockImportModule).toHaveBeenCalledWith(
          path.resolve('/test/base/path', 'test/callbacks.js'),
          'testFunction',
        );
        expect(mockExternalFunction).toHaveBeenCalledWith('{"param": "test_value"}');
        expect(result.output).toBe('External function result');
        expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5, numRequests: 1 });
      });

      it('should cache external functions and not reload them on subsequent calls', async () => {
        const mockResponse = {
          data: {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        name: 'cached_function',
                        arguments: '{"value": 123}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 12, prompt_tokens: 8, completion_tokens: 4 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
        mockFetchWithCache.mockResolvedValue(mockResponse);

        const mockCachedFunction = vi.fn().mockResolvedValue('Cached result');
        mockImportModule.mockResolvedValue({
          cachedFunction: mockCachedFunction,
        });

        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'cached_function',
                  description: 'A cached function',
                  parameters: {
                    type: 'object',
                    properties: {
                      value: { type: 'number' },
                    },
                    required: ['value'],
                  },
                },
              },
            ],
            functionToolCallbacks: {
              cached_function: 'file://callbacks/cache-test.js:cachedFunction',
            },
          },
        });

        // First call - should load the function
        const result1 = await provider.callApi('First call');
        expect(mockImportModule).toHaveBeenCalledTimes(1);
        expect(mockCachedFunction).toHaveBeenCalledWith('{"value": 123}');
        expect(result1.output).toBe('Cached result');

        // Reset fetch mock for second call
        mockFetchWithCache.mockResolvedValue(mockResponse);

        // Second call - should use cached function, not reload
        const result2 = await provider.callApi('Second call');
        expect(mockImportModule).toHaveBeenCalledTimes(1); // Still only 1 call
        expect(mockCachedFunction).toHaveBeenCalledTimes(2);
        expect(result2.output).toBe('Cached result');
      });

      it('should handle errors in external function loading gracefully', async () => {
        const mockResponse = {
          data: {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        name: 'error_function',
                        arguments: '{"test": "data"}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 10, prompt_tokens: 6, completion_tokens: 4 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
        mockFetchWithCache.mockResolvedValue(mockResponse);

        // Mock import module to throw an error
        mockImportModule.mockRejectedValue(new Error('Module not found'));

        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'error_function',
                  description: 'A function that errors during loading',
                  parameters: {
                    type: 'object',
                    properties: {
                      test: { type: 'string' },
                    },
                  },
                },
              },
            ],
            functionToolCallbacks: {
              error_function: 'file://nonexistent/module.js:errorFunction',
            },
          },
        });

        const result = await provider.callApi('Call error function');

        expect(mockImportModule).toHaveBeenCalledWith(
          path.resolve('/test/base/path', 'nonexistent/module.js'),
          'errorFunction',
        );
        // Should fall back to original function call object when loading fails
        expect(result.output).toEqual([
          {
            function: {
              name: 'error_function',
              arguments: '{"test": "data"}',
            },
          },
        ]);
      });

      it('should handle errors in external function execution gracefully', async () => {
        const mockResponse = {
          data: {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        name: 'failing_function',
                        arguments: '{"input": "test"}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 8, prompt_tokens: 5, completion_tokens: 3 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
        mockFetchWithCache.mockResolvedValue(mockResponse);

        // Mock a function that throws during execution
        const mockFailingFunction = vi
          .fn()
          .mockRejectedValue(new Error('Function execution failed'));
        mockImportModule.mockResolvedValue({
          failingFunction: mockFailingFunction,
        });

        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'failing_function',
                  description: 'A function that fails during execution',
                  parameters: {
                    type: 'object',
                    properties: {
                      input: { type: 'string' },
                    },
                  },
                },
              },
            ],
            functionToolCallbacks: {
              failing_function: 'file://callbacks/failing.js:failingFunction',
            },
          },
        });

        const result = await provider.callApi('Call failing function');

        expect(mockFailingFunction).toHaveBeenCalledWith('{"input": "test"}');
        // Should fall back to original function call object when execution fails
        expect(result.output).toEqual([
          {
            function: {
              name: 'failing_function',
              arguments: '{"input": "test"}',
            },
          },
        ]);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('Function callback failed for failing_function'),
        );
      });

      it('should handle file reference parsing correctly', async () => {
        const mockResponse = {
          data: {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        name: 'parsed_function',
                        arguments: '{"data": "parsing_test"}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 14, prompt_tokens: 9, completion_tokens: 5 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
        mockFetchWithCache.mockResolvedValue(mockResponse);

        const mockParsedFunction = vi.fn().mockResolvedValue('Parsed successfully');
        mockImportModule.mockResolvedValue(mockParsedFunction);

        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'parsed_function',
                  description: 'Tests file reference parsing',
                  parameters: {
                    type: 'object',
                    properties: {
                      data: { type: 'string' },
                    },
                  },
                },
              },
            ],
            functionToolCallbacks: {
              parsed_function: 'file://deep/path/module.js:deepExport.nestedFunction',
            },
          },
        });

        const result = await provider.callApi('Test parsing');

        expect(mockImportModule).toHaveBeenCalledWith(
          path.resolve('/test/base/path', 'deep/path/module.js'),
          'deepExport.nestedFunction',
        );
        expect(mockParsedFunction).toHaveBeenCalledWith('{"data": "parsing_test"}');
        expect(result.output).toBe('Parsed successfully');
      });

      it('should handle mixed inline and external function callbacks', async () => {
        const mockResponse = {
          data: {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        name: 'inline_function',
                        arguments: '{"inline": "test"}',
                      },
                    },
                    {
                      function: {
                        name: 'external_function',
                        arguments: '{"external": "test"}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 20, prompt_tokens: 12, completion_tokens: 8 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
        mockFetchWithCache.mockResolvedValue(mockResponse);

        const mockInlineFunction = vi.fn().mockResolvedValue('Inline result');
        const mockExternalFunction = vi.fn().mockResolvedValue('External result');
        mockImportModule.mockResolvedValue({
          externalFunc: mockExternalFunction,
        });

        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'inline_function',
                  description: 'An inline function',
                  parameters: {
                    type: 'object',
                    properties: {
                      inline: { type: 'string' },
                    },
                  },
                },
              },
              {
                type: 'function',
                function: {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'object',
                    properties: {
                      external: { type: 'string' },
                    },
                  },
                },
              },
            ],
            functionToolCallbacks: {
              inline_function: mockInlineFunction,
              external_function: 'file://mixed/callbacks.js:externalFunc',
            },
          },
        });

        const result = await provider.callApi('Test mixed callbacks');

        expect(mockInlineFunction).toHaveBeenCalledWith('{"inline": "test"}');
        expect(mockImportModule).toHaveBeenCalledWith(
          path.resolve('/test/base/path', 'mixed/callbacks.js'),
          'externalFunc',
        );
        expect(mockExternalFunction).toHaveBeenCalledWith('{"external": "test"}');
        expect(result.output).toBe('Inline result\nExternal result');
      });
    });

    it('should prioritize response_format from prompt config over provider config', async () => {
      const providerResponseFormat = {
        type: 'json_object' as const,
      };
      const promptResponseFormat = {
        type: 'json_schema',
        json_schema: {
          name: 'test_schema',
          strict: true,
          schema: {
            type: 'object',
            properties: { key2: { type: 'string' } },
            additionalProperties: false,
          },
        },
      };

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          response_format: providerResponseFormat,
        },
      });

      const mockResponse = {
        data: {
          choices: [{ message: { content: '{"key2": "value2"}' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const result = await provider.callApi('Test prompt', {
        vars: {},
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
          config: {
            response_format: promptResponseFormat,
          },
        },
      });

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const requestBody = JSON.parse(call[1].body);
      expect(requestBody.response_format).toEqual(promptResponseFormat);
      expect(result.output).toEqual({ key2: 'value2' });
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    it('should use provider config response_format when prompt config is not provided', async () => {
      const providerResponseFormat = {
        type: 'json_object' as const,
      };

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          response_format: providerResponseFormat,
        },
      });

      const mockResponse = {
        data: {
          choices: [{ message: { content: '{"key1": "value1"}' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const result = await provider.callApi('Test prompt', {
        vars: {},
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
        },
      });

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const requestBody = JSON.parse(call[1].body);
      expect(requestBody.response_format).toEqual(providerResponseFormat);
      expect(result.output).toBe('{"key1": "value1"}');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    it('should call API with basic chat completion', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        severity: 'info',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    it('should handle caching correctly with multiple chat calls', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output 2' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        severity: 'info',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt 2' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output 2');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });

      const cachedResponse = {
        ...mockResponse,
        cached: true,
        status: 200,
        statusText: 'OK',
        severity: 'info',
      };
      mockFetchWithCache.mockResolvedValue(cachedResponse);

      const result2 = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt 2' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      expect(result2.output).toBe('Test output 2');
      // Cached responses don't count as new requests, so numRequests is not included
      expect(result2.tokenUsage).toEqual({ total: 10, cached: 10 });
    });

    it('should handle disabled cache correctly for chat completion', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        severity: 'info',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });

      disableCache();

      const result2 = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      expect(result2.output).toBe('Test output');
      expect(result2.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });

      enableCache();
    });

    it('should identify reasoning models correctly', async () => {
      const regularProvider = new OpenAiChatCompletionProvider('gpt-4');
      const o1Provider = new OpenAiChatCompletionProvider('o1-mini');
      const o3Provider = new OpenAiChatCompletionProvider('o3-mini');
      const o1PreviewProvider = new OpenAiChatCompletionProvider('o1-preview');
      const o3StandardProvider = new OpenAiChatCompletionProvider('o3');
      const o4MiniProvider = new OpenAiChatCompletionProvider('o4-mini');

      expect(regularProvider['isReasoningModel']()).toBe(false);
      expect(o1Provider['isReasoningModel']()).toBe(true);
      expect(o3Provider['isReasoningModel']()).toBe(true);
      expect(o1PreviewProvider['isReasoningModel']()).toBe(true);
      expect(o3StandardProvider['isReasoningModel']()).toBe(true);
      expect(o4MiniProvider['isReasoningModel']()).toBe(true);
    });

    it('should identify GPT-5 models correctly including prefixed names', async () => {
      // Direct model names
      const gpt5Provider = new OpenAiChatCompletionProvider('gpt-5');
      const gpt5MiniProvider = new OpenAiChatCompletionProvider('gpt-5-mini');
      const gpt5NanoProvider = new OpenAiChatCompletionProvider('gpt-5-nano');

      // Prefixed model names (used by GitHub Models)
      const prefixedGpt5Provider = new OpenAiChatCompletionProvider('openai/gpt-5');
      const prefixedGpt5MiniProvider = new OpenAiChatCompletionProvider('openai/gpt-5-mini');
      const prefixedGpt5NanoProvider = new OpenAiChatCompletionProvider('openai/gpt-5-nano');

      // Non-GPT-5 models
      const gpt4Provider = new OpenAiChatCompletionProvider('gpt-4');
      const gpt4oProvider = new OpenAiChatCompletionProvider('openai/gpt-4o');

      expect(gpt5Provider['isGPT5Model']()).toBe(true);
      expect(gpt5MiniProvider['isGPT5Model']()).toBe(true);
      expect(gpt5NanoProvider['isGPT5Model']()).toBe(true);
      expect(prefixedGpt5Provider['isGPT5Model']()).toBe(true);
      expect(prefixedGpt5MiniProvider['isGPT5Model']()).toBe(true);
      expect(prefixedGpt5NanoProvider['isGPT5Model']()).toBe(true);
      expect(gpt4Provider['isGPT5Model']()).toBe(false);
      expect(gpt4oProvider['isGPT5Model']()).toBe(false);
    });

    it('should identify reasoning models with prefixed names (GitHub Models)', async () => {
      // Prefixed reasoning models
      const prefixedO1Provider = new OpenAiChatCompletionProvider('openai/o1-mini');
      const prefixedO3Provider = new OpenAiChatCompletionProvider('openai/o3-mini');
      const prefixedO4Provider = new OpenAiChatCompletionProvider('openai/o4-mini');
      const prefixedGpt5Provider = new OpenAiChatCompletionProvider('openai/gpt-5');
      const prefixedGpt5MiniProvider = new OpenAiChatCompletionProvider('openai/gpt-5-mini');

      // Non-reasoning prefixed models
      const prefixedGpt4oProvider = new OpenAiChatCompletionProvider('openai/gpt-4o');

      expect(prefixedO1Provider['isReasoningModel']()).toBe(true);
      expect(prefixedO3Provider['isReasoningModel']()).toBe(true);
      expect(prefixedO4Provider['isReasoningModel']()).toBe(true);
      expect(prefixedGpt5Provider['isReasoningModel']()).toBe(true);
      expect(prefixedGpt5MiniProvider['isReasoningModel']()).toBe(true);
      expect(prefixedGpt4oProvider['isReasoningModel']()).toBe(false);
    });

    it('should handle temperature support correctly', async () => {
      const regularProvider = new OpenAiChatCompletionProvider('gpt-4');
      const o1Provider = new OpenAiChatCompletionProvider('o1-mini');
      const o3Provider = new OpenAiChatCompletionProvider('o3-mini');
      const o1PreviewProvider = new OpenAiChatCompletionProvider('o1-preview');
      const o4MiniProvider = new OpenAiChatCompletionProvider('o4-mini');
      const gpt41Provider = new OpenAiChatCompletionProvider('gpt-4.1');

      expect(regularProvider['supportsTemperature']()).toBe(true);
      expect(o1Provider['supportsTemperature']()).toBe(false);
      expect(o3Provider['supportsTemperature']()).toBe(false);
      expect(o1PreviewProvider['supportsTemperature']()).toBe(false);
      expect(o4MiniProvider['supportsTemperature']()).toBe(false);
      expect(gpt41Provider['supportsTemperature']()).toBe(true);
    });

    it('should respect temperature settings based on model type', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      // Test regular model with temperature
      const regularProvider = new OpenAiChatCompletionProvider('gpt-4', {
        config: { temperature: 0.7 },
      });
      await regularProvider.callApi('Test prompt');
      const regularCall = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const regularBody = JSON.parse(regularCall[1].body);
      expect(regularBody.temperature).toBe(0.7);

      // Test O1 model (should omit temperature)
      mockFetchWithCache.mockClear();
      const o1Provider = new OpenAiChatCompletionProvider('o1-mini', {
        config: { temperature: 0.7 },
      });
      await o1Provider.callApi('Test prompt');
      const o1Call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const o1Body = JSON.parse(o1Call[1].body);
      expect(o1Body.temperature).toBeUndefined();
    });

    it('should correctly send temperature: 0 in the request body', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      // Test that temperature: 0 is correctly sent (not filtered out by falsy check)
      const provider = new OpenAiChatCompletionProvider('gpt-4', {
        config: { temperature: 0 },
      });
      await provider.callApi('Test prompt');
      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      // temperature: 0 should be present in the request body
      expect(body.temperature).toBe(0);
      expect('temperature' in body).toBe(true);
    });

    it('should correctly send max_tokens: 0 in the request body when explicitly set', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      // Test that max_tokens: 0 is correctly sent (not filtered out by falsy check)
      // Note: While max_tokens: 0 is impractical, it should still be sent if explicitly configured
      const provider = new OpenAiChatCompletionProvider('gpt-4', {
        config: { max_tokens: 0 },
      });
      await provider.callApi('Test prompt');
      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      // max_tokens: 0 should be present in the request body
      expect(body.max_tokens).toBe(0);
      expect('max_tokens' in body).toBe(true);
    });

    it('should handle max tokens settings based on model type', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      // Test regular model with max_tokens
      const regularProvider = new OpenAiChatCompletionProvider('gpt-4', {
        config: { max_tokens: 100 },
      });
      await regularProvider.callApi('Test prompt');
      const regularCall = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const regularBody = JSON.parse(regularCall[1].body);
      expect(regularBody.max_tokens).toBe(100);
      expect(regularBody.max_completion_tokens).toBeUndefined();

      // Test O1 model with max_completion_tokens
      mockFetchWithCache.mockClear();
      const o1Provider = new OpenAiChatCompletionProvider('o1-mini', {
        config: { max_completion_tokens: 200 },
      });
      await o1Provider.callApi('Test prompt');
      const o1Call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const o1Body = JSON.parse(o1Call[1].body);
      expect(o1Body.max_tokens).toBeUndefined();
      expect(o1Body.max_completion_tokens).toBe(200);

      // Test GPT-5 model should not include max_tokens
      mockFetchWithCache.mockClear();
      const gpt5Provider = new OpenAiChatCompletionProvider('gpt-5', {
        config: { max_tokens: 300 },
      });
      await gpt5Provider.callApi('Test prompt');
      const gpt5Call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const gpt5Body = JSON.parse(gpt5Call[1].body);
      expect(gpt5Body.max_tokens).toBeUndefined();
      expect(gpt5Body.max_completion_tokens).toBeUndefined();

      // Test prefixed GPT-5 model (GitHub Models) should not include max_tokens
      mockFetchWithCache.mockClear();
      const prefixedGpt5Provider = new OpenAiChatCompletionProvider('openai/gpt-5-mini', {
        config: { max_tokens: 400 },
      });
      await prefixedGpt5Provider.callApi('Test prompt');
      const prefixedGpt5Call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const prefixedGpt5Body = JSON.parse(prefixedGpt5Call[1].body);
      expect(prefixedGpt5Body.max_tokens).toBeUndefined();
      expect(prefixedGpt5Body.max_completion_tokens).toBeUndefined();
    });

    it('should handle reasoning_effort for reasoning models', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      // Test O1 model with reasoning_effort
      const o1Provider = new OpenAiChatCompletionProvider('o1-mini', {
        config: { reasoning_effort: 'high' } as any,
      });
      await o1Provider.callApi('Test prompt');
      const o1Call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const o1Body = JSON.parse(o1Call[1].body);
      expect(o1Body.reasoning_effort).toBe('high');

      // Test regular model (should not include reasoning_effort)
      mockFetchWithCache.mockClear();
      const regularProvider = new OpenAiChatCompletionProvider('gpt-4', {
        config: { reasoning_effort: 'high' } as any,
      });
      await regularProvider.callApi('Test prompt');
      const regularCall = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const regularBody = JSON.parse(regularCall[1].body);
      expect(regularBody.reasoning_effort).toBeUndefined();
    });

    it('should handle o4-mini with reasoning_effort and service_tier', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test response' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      // Test O4-mini model with reasoning_effort
      const o4Provider = new OpenAiChatCompletionProvider('o4-mini', {
        config: {
          reasoning_effort: 'medium',
          service_tier: 'premium',
        } as any,
      });

      const { body: o4Body } = await o4Provider.getOpenAiBody('Test prompt');
      expect(o4Body.reasoning_effort).toBe('medium');
      expect(o4Body.service_tier).toBe('premium');
    });

    it('should handle user, metadata, and store parameters', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test response' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o', {
        config: {
          user: 'user-123',
          metadata: {
            project: 'test-project',
            version: '1.0.0',
          },
          store: true,
        } as any,
      });

      const { body } = await provider.getOpenAiBody('Test prompt');
      expect(body.user).toBe('user-123');
      expect(body.metadata).toEqual({
        project: 'test-project',
        version: '1.0.0',
      });
      expect(body.store).toBe(true);
    });

    it('should handle enhanced reasoning interface for o-series models', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test response' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const o1Provider = new OpenAiChatCompletionProvider('o1-mini', {
        config: {
          reasoning: {
            effort: 'high',
            summary: 'detailed',
          },
        } as any,
      });

      const { body } = await o1Provider.getOpenAiBody('Test prompt');
      expect(body.reasoning).toEqual({
        effort: 'high',
        summary: 'detailed',
      });
    });

    it('should handle audio responses correctly', async () => {
      const mockAudioResponse = {
        data: {
          choices: [
            {
              message: {
                audio: {
                  id: 'audio-id-123',
                  expires_at: '2023-12-31T23:59:59Z',
                  data: 'base64audiodata',
                  transcript: 'This is the audio transcript',
                  format: 'mp3',
                },
              },
            },
          ],
          usage: { total_tokens: 15, prompt_tokens: 10, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockAudioResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('Generate audio response');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('This is the audio transcript');
      expect(result.audio).toEqual({
        id: 'audio-id-123',
        expiresAt: '2023-12-31T23:59:59Z',
        data: 'base64audiodata',
        transcript: 'This is the audio transcript',
        format: 'mp3',
      });
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5, numRequests: 1 });
    });

    it('should handle audio responses without transcript', async () => {
      const mockAudioResponse = {
        data: {
          choices: [
            {
              message: {
                audio: {
                  id: 'audio-id-456',
                  expires_at: '2023-12-31T23:59:59Z',
                  data: 'base64audiodata',
                  format: 'wav',
                },
              },
            },
          ],
          usage: { total_tokens: 12, prompt_tokens: 8, completion_tokens: 4 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockAudioResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('Generate audio without transcript');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe(''); // Empty string when no transcript
      expect(result.audio).toEqual({
        id: 'audio-id-456',
        expiresAt: '2023-12-31T23:59:59Z',
        data: 'base64audiodata',
        transcript: undefined,
        format: 'wav',
      });
      expect(result.tokenUsage).toEqual({ total: 12, prompt: 8, completion: 4, numRequests: 1 });
    });

    it('should use default wav format when not specified', async () => {
      const mockAudioResponse = {
        data: {
          choices: [
            {
              message: {
                audio: {
                  id: 'audio-id-789',
                  expires_at: '2023-12-31T23:59:59Z',
                  data: 'base64audiodata',
                  transcript: 'Audio without format specified',
                },
              },
            },
          ],
          usage: { total_tokens: 18, prompt_tokens: 12, completion_tokens: 6 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockAudioResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('Generate audio without format');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Audio without format specified');
      expect(result.audio).toEqual({
        id: 'audio-id-789',
        expiresAt: '2023-12-31T23:59:59Z',
        data: 'base64audiodata',
        transcript: 'Audio without format specified',
        format: 'wav', // Default format
      });
      expect(result.tokenUsage).toEqual({ total: 18, prompt: 12, completion: 6, numRequests: 1 });
    });

    it('should handle cached audio responses correctly', async () => {
      const mockAudioResponse = {
        data: {
          choices: [
            {
              message: {
                audio: {
                  id: 'audio-id-cached',
                  expires_at: '2023-12-31T23:59:59Z',
                  data: 'base64audiodatacached',
                  transcript: 'This is a cached audio response',
                  format: 'mp3',
                },
              },
            },
          ],
          usage: { total_tokens: 20, prompt_tokens: 15, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockAudioResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('Generate cached audio');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('This is a cached audio response');
      expect(result.audio).toEqual({
        id: 'audio-id-cached',
        expiresAt: '2023-12-31T23:59:59Z',
        data: 'base64audiodatacached',
        transcript: 'This is a cached audio response',
        format: 'mp3',
      });
      expect(result.cached).toBe(false);

      // Now test with cached response
      const cachedResponse = {
        ...mockAudioResponse,
        cached: true,
      };
      mockFetchWithCache.mockResolvedValue(cachedResponse);

      const cachedResult = await provider.callApi('Generate cached audio');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      expect(cachedResult.output).toBe('This is a cached audio response');
      expect(cachedResult.audio).toEqual({
        id: 'audio-id-cached',
        expiresAt: '2023-12-31T23:59:59Z',
        data: 'base64audiodatacached',
        transcript: 'This is a cached audio response',
        format: 'mp3',
      });
      expect(cachedResult.cached).toBe(true);
      // Cached responses don't count as new requests, so numRequests is not included
      expect(cachedResult.tokenUsage).toEqual({ total: 20, cached: 20 });
    });

    it('should properly handle audio requested with response_format option', async () => {
      // Setup provider with response_format that specifies audio
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          response_format: { type: 'audio' } as any,
        },
      });

      // Mock a non-audio response (model doesn't support audio format)
      const mockTextResponse = {
        data: {
          choices: [{ message: { content: 'Model responded with text instead of audio' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockTextResponse);

      // Call the API with audio format requested
      const result = await provider.callApi('Generate audio please');

      // Verify request sent with audio format
      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const requestBody = JSON.parse(call[1].body);
      expect(requestBody.response_format).toEqual({ type: 'audio' });

      // Verify result handled gracefully
      expect(result.output).toBe('Model responded with text instead of audio');
      expect(result.audio).toBeUndefined(); // No audio returned
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    it('should surface a normalised finishReason', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: { content: 'done' },
              finish_reason: 'function_call', // This should be normalized to 'tool_calls'
            },
          ],
          usage: { total_tokens: 3, prompt_tokens: 1, completion_tokens: 2 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('hi');

      expect(result.finishReason).toBe('tool_calls'); // confirms adapter ran the normaliser
    });

    it('should handle case normalization in finishReason', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: { content: 'done' },
              finish_reason: 'LENGTH', // Uppercase should be normalized to lowercase
            },
          ],
          usage: { total_tokens: 3, prompt_tokens: 1, completion_tokens: 2 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('hi');

      expect(result.finishReason).toBe('length'); // normalized to lowercase
    });

    it('should exclude finishReason when normalization returns undefined', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: { content: 'done' },
              finish_reason: '', // Empty string should be excluded
            },
          ],
          usage: { total_tokens: 3, prompt_tokens: 1, completion_tokens: 2 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const result = await provider.callApi('hi');

      expect(result.finishReason).toBeUndefined(); // Should be excluded when empty
    });

    it('should use generic error message with fallback when apiKeyEnvar is undefined', async () => {
      // Clear any existing API key environment variables
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should use custom apiKeyEnvar in error message when provided', async () => {
      // Clear any existing API key environment variables
      const originalEnv = process.env.OPENAI_API_KEY;
      const originalCustomEnv = process.env.CUSTOM_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.CUSTOM_API_KEY;

      try {
        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: { apiKeyEnvar: 'CUSTOM_API_KEY' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'API key is not set. Set the CUSTOM_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
        if (originalCustomEnv) {
          process.env.CUSTOM_API_KEY = originalCustomEnv;
        }
      }
    });

    it('should demonstrate improved logging for inherited classes', async () => {
      // Create a mock class that extends OpenAiChatCompletionProvider
      class CustomProvider extends OpenAiChatCompletionProvider {
        constructor(modelName: string) {
          super(modelName, {
            config: {
              apiKeyEnvar: 'CUSTOM_PROVIDER_API_KEY',
              apiBaseUrl: 'https://custom-api.example.com/v1',
            },
          });
        }

        getApiUrlDefault(): string {
          return 'https://custom-api.example.com/v1';
        }
      }

      // Clear environment variables
      const originalEnv = process.env.OPENAI_API_KEY;
      const originalCustomEnv = process.env.CUSTOM_PROVIDER_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.CUSTOM_PROVIDER_API_KEY;

      try {
        const provider = new CustomProvider('custom-model');

        // Should show generic error message with custom API key variable
        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'API key is not set. Set the CUSTOM_PROVIDER_API_KEY environment variable or add `apiKey` to the provider config.',
        );

        // Should log generic message for unknown model
        expect(mockLogger.debug).toHaveBeenCalledWith('Using unknown chat model: custom-model');
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
        if (originalCustomEnv) {
          process.env.CUSTOM_PROVIDER_API_KEY = originalCustomEnv;
        }
      }
    });

    it('should work well with third-party providers that inherit from OpenAiChatCompletionProvider', async () => {
      // Example similar to what providers like Anthropic or DeepSeek might do
      class DeepSeekProvider extends OpenAiChatCompletionProvider {
        constructor(modelName: string) {
          super(modelName, {
            config: {
              apiKeyEnvar: 'DEEPSEEK_API_KEY',
              apiBaseUrl: 'https://api.deepseek.com/v1',
            },
          });
        }

        getApiUrlDefault(): string {
          return 'https://api.deepseek.com/v1';
        }
      }

      const mockResponse = {
        data: {
          choices: [{ message: { content: 'DeepSeek response' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new DeepSeekProvider('deepseek-chat');
      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('DeepSeek response');
    });

    it('should log generic API call message using getApiUrl', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      await provider.callApi('Test prompt');
    });

    it('should log generic completions API response message', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      await provider.callApi('Test prompt');
    });

    it('should log generic message for unknown chat models', async () => {
      new OpenAiChatCompletionProvider('unknown-model');

      expect(mockLogger.debug).toHaveBeenCalledWith('Using unknown chat model: unknown-model');
    });

    it('should not log unknown model message for known OpenAI models', async () => {
      new OpenAiChatCompletionProvider('gpt-4o-mini');

      expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('unknown'));
    });

    it('should support legacy model IDs', async () => {
      // Test legacy GPT-4 models
      const gpt4LegacyProvider = new OpenAiChatCompletionProvider('gpt-4-0314');
      expect(gpt4LegacyProvider.modelName).toBe('gpt-4-0314');

      const gpt4_32kProvider = new OpenAiChatCompletionProvider('gpt-4-32k-0314');
      expect(gpt4_32kProvider.modelName).toBe('gpt-4-32k-0314');

      const gpt4VisionProvider = new OpenAiChatCompletionProvider('gpt-4-vision-preview');
      expect(gpt4VisionProvider.modelName).toBe('gpt-4-vision-preview');

      // Test legacy GPT-3.5 models
      const gpt35LegacyProvider = new OpenAiChatCompletionProvider('gpt-3.5-turbo-0301');
      expect(gpt35LegacyProvider.modelName).toBe('gpt-3.5-turbo-0301');

      const gpt35_16kProvider = new OpenAiChatCompletionProvider('gpt-3.5-turbo-16k');
      expect(gpt35_16kProvider.modelName).toBe('gpt-3.5-turbo-16k');

      // Test latest audio model
      const audioModelProvider = new OpenAiChatCompletionProvider(
        'gpt-4o-audio-preview-2025-06-03',
      );
      expect(audioModelProvider.modelName).toBe('gpt-4o-audio-preview-2025-06-03');
    });

    it('should work with apiKeyRequired: false and API key from environment', () => {
      const originalEnv = process.env.CUSTOM_LOCAL_API_KEY;
      process.env.CUSTOM_LOCAL_API_KEY = 'test-local-key';

      try {
        const provider = new OpenAiChatCompletionProvider('local-model', {
          config: {
            apiKeyRequired: false,
            apiKeyEnvar: 'CUSTOM_LOCAL_API_KEY',
            apiBaseUrl: 'http://localhost:8080/v1',
          },
        });

        // Provider should pick up API key from environment
        expect(provider.getApiKey()).toBe('test-local-key');

        // Provider should not require API key
        expect(provider.requiresApiKey()).toBe(false);
      } finally {
        if (originalEnv !== undefined) {
          process.env.CUSTOM_LOCAL_API_KEY = originalEnv;
        } else {
          delete process.env.CUSTOM_LOCAL_API_KEY;
        }
      }
    });

    it('should work with apiKeyRequired: false and no API key', async () => {
      // Ensure no API key is set in the environment
      const originalCustomEnv = process.env.CUSTOM_LOCAL_API_KEY;
      const originalOpenAIEnv = process.env.OPENAI_API_KEY;
      delete process.env.CUSTOM_LOCAL_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new OpenAiChatCompletionProvider('local-model', {
          config: {
            apiKeyRequired: false,
            apiKeyEnvar: 'CUSTOM_LOCAL_API_KEY',
            apiBaseUrl: 'http://localhost:8080/v1',
          },
        });

        // Provider should not have an API key
        expect(provider.getApiKey()).toBeFalsy();

        // Provider should not require API key
        expect(provider.requiresApiKey()).toBe(false);

        // Mock successful API response
        const mockResponse = {
          data: {
            choices: [{ message: { content: 'Response without auth' } }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
        mockFetchWithCache.mockResolvedValue(mockResponse);

        // Call the API
        const result = await provider.callApi(
          JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
        );

        // Verify the call succeeded
        expect(result.output).toBe('Response without auth');
        expect(mockFetchWithCache).toHaveBeenCalledTimes(1);

        // Verify that the Authorization header was NOT included (should not be "Bearer undefined")
        const callArgs = mockFetchWithCache.mock.calls[0];
        const headers = callArgs[1]?.headers as Record<string, string>;
        expect(headers.Authorization).toBeUndefined();
      } finally {
        if (originalCustomEnv !== undefined) {
          process.env.CUSTOM_LOCAL_API_KEY = originalCustomEnv;
        }
        if (originalOpenAIEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalOpenAIEnv;
        }
      }
    });
  });
});
