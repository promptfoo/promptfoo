import { clearCache, disableCache, enableCache } from '../../src/cache';
import { GroqProvider } from '../../src/providers/groq';
import { maybeLoadFromExternalFile } from '../../src/util';

jest.mock('groq-sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});
jest.mock('../../src/logger');
jest.mock('../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn(),
  renderVarsInObject: jest.fn(),
}));

describe('Groq', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('GroqProvider', () => {
    const provider = new GroqProvider('mixtral-8x7b-32768');

    it('should initialize with correct model name', () => {
      expect(provider.getModelName()).toBe('mixtral-8x7b-32768');
    });

    it('should return correct id', () => {
      expect(provider.id()).toBe('groq:mixtral-8x7b-32768');
    });

    it('should return correct string representation', () => {
      expect(provider.toString()).toBe('[Groq Provider mixtral-8x7b-32768]');
    });

    it('should serialize to JSON correctly without API key', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'groq',
        model: 'mixtral-8x7b-32768',
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });
    });

    it('should serialize to JSON correctly with API key redacted', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      const json = provider.toJSON();
      expect(json).toEqual({
        provider: 'groq',
        model: 'mixtral-8x7b-32768',
        config: {
          temperature: 0.7,
          apiKey: undefined,
        },
      });
      // Ensure the original apiKey is not affected
      expect(provider.getApiKey()).toBe('secret-api-key');
    });

    describe('callApi', () => {
      it('should call Groq API and return output with correct structure', async () => {
        const mockResponse = {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (provider as any).groq = { chat: { completions: { create: mockCreate } } };

        const result = await provider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'system',
                content: 'You are a helpful assistant.',
              }),
              expect.objectContaining({
                role: 'user',
                content: 'Test prompt',
              }),
            ]),
            model: 'mixtral-8x7b-32768',
            temperature: 0.7,
            max_completion_tokens: 1000,
            top_p: 1,
            tool_choice: 'auto',
          }),
        );

        expect(result).toEqual({
          output: 'Test output',
          tokenUsage: {
            total: 10,
            prompt: 5,
            completion: 5,
          },
        });
      });

      it('should use cache by default', async () => {
        const mockResponse = {
          choices: [{ message: { content: 'Cached output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (provider as any).groq = { chat: { completions: { create: mockCreate } } };

        await provider.callApi('Test prompt');
        const cachedResult = await provider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(cachedResult).toEqual({
          output: 'Cached output',
          tokenUsage: {
            total: 10,
            prompt: 5,
            completion: 5,
            cached: 10,
          },
        });
      });

      it('should not use cache if caching is disabled', async () => {
        const mockResponse = {
          choices: [{ message: { content: 'Fresh output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (provider as any).groq = { chat: { completions: { create: mockCreate } } };

        disableCache();

        const result1 = await provider.callApi('Test prompt');
        const result2 = await provider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(result1).toEqual(result2);
        expect(result1.tokenUsage).not.toHaveProperty('cached');

        enableCache();
      });

      it('should handle API errors', async () => {
        const mockError = new Error('API Error') as any;
        mockError.name = 'APIError';
        mockError.status = 400;
        const mockCreate = jest.fn().mockRejectedValue(mockError);
        (provider as any).groq = { chat: { completions: { create: mockCreate } } };

        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          error: 'API call error: 400 APIError: API Error',
        });
      });

      it('should handle non-API errors', async () => {
        const mockError = new Error('Unknown error');
        const mockCreate = jest.fn().mockRejectedValue(mockError);
        (provider as any).groq = { chat: { completions: { create: mockCreate } } };

        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          error: 'API call error: Error: Unknown error',
        });
      });

      it('should pass custom configuration options including tools and tool_choice', async () => {
        const tools: {
          type: 'function';
          function: {
            name: string;
            description?: string | undefined;
            parameters?: Record<string, any> | undefined;
          };
        }[] = [{ type: 'function', function: { name: 'test_function' } }];
        jest.mocked(maybeLoadFromExternalFile).mockReturnValue(tools);

        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            temperature: 0.7,
            max_completion_tokens: 100,
            top_p: 0.9,
            tools,
            tool_choice: 'auto',
          },
        });

        const mockCreate = jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Custom output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        });
        (customProvider as any).groq = { chat: { completions: { create: mockCreate } } };

        await customProvider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 0.7,
            max_completion_tokens: 100,
            top_p: 0.9,
            tools,
            tool_choice: 'auto',
            messages: expect.any(Array),
            model: 'llama3-groq-8b-8192-tool-use-preview',
          }),
        );
      });

      it('should handle deprecated max_tokens parameter', async () => {
        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            max_tokens: 100,
          },
        });

        const mockCreate = jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        });
        (customProvider as any).groq = { chat: { completions: { create: mockCreate } } };

        await customProvider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            max_completion_tokens: 100,
          }),
        );
      });

      it('should prioritize max_completion_tokens over max_tokens', async () => {
        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            max_completion_tokens: 200,
            max_tokens: 100,
          },
        });

        const mockCreate = jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        });
        (customProvider as any).groq = { chat: { completions: { create: mockCreate } } };

        await customProvider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            max_completion_tokens: 200,
          }),
        );
      });

      it('should handle tool calls and function callbacks', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'test_function', arguments: '{"arg": "value"}' },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        const mockCallback = jest.fn().mockResolvedValue('Function result');

        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            functionToolCallbacks: {
              test_function: mockCallback,
            },
          },
        });
        (customProvider as any).groq = { chat: { completions: { create: mockCreate } } };

        const result = await customProvider.callApi('Test prompt');

        expect(mockCallback).toHaveBeenCalledWith('{"arg": "value"}');
        expect(result.output).toContain(
          '[{"id":"call_123","type":"function","function":{"name":"test_function","arguments":"{\\"arg\\": \\"value\\"}"}}]',
        );
        expect(result.output).toContain('[Function Result: Function result]');
      });

      it('should use custom system prompt', async () => {
        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            systemPrompt: 'Custom system prompt',
          },
        });

        const mockResponse = {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (customProvider as any).groq = { chat: { completions: { create: mockCreate } } };

        await customProvider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'system',
                content: 'Custom system prompt',
              }),
            ]),
          }),
        );
      });

      it('should handle empty response', async () => {
        const mockResponse = {
          choices: [{ message: { content: '' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (provider as any).groq = { chat: { completions: { create: mockCreate } } };

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('');
      });

      it('should handle unexpected API response structure', async () => {
        const mockResponse = {};
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (provider as any).groq = { chat: { completions: { create: mockCreate } } };

        await expect(provider.callApi('Test prompt')).resolves.toEqual({
          error: 'API call error: Error: Invalid response from Groq API',
        });
      });

      it('should use maybeLoadFromExternalFile for tools configuration', async () => {
        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'external_tool',
                  description: 'An external tool',
                },
              },
            ],
          },
        });

        const mockResponse = {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (customProvider as any).groq = { chat: { completions: { create: mockCreate } } };

        await customProvider.callApi('Test prompt');

        expect(maybeLoadFromExternalFile).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'function',
              function: {
                name: 'external_tool',
                description: 'An external tool',
              },
            }),
          ]),
        );
      });
    });
  });
});
