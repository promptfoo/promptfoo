import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

jest.mock('../../../src/cache');

const mockFetchWithCache = jest.mocked(fetchWithCache);

describe('OpenAI Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiChatCompletionProvider', () => {
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

      disableCache();

      const result2 = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      expect(result2.output).toBe('Test output');
      expect(result2.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    });

    it('should handle model refusals correctly', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { refusal: 'Content policy violation' } }],
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
      expect(result.tokenUsage).toEqual({ total: 5, prompt: 5, completion: 0 });
      expect(result.isRefusal).toBe(true);
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10 });
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
      expect(result.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10 });
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

      const mockWeatherFunction = jest.fn().mockResolvedValue('Sunny, 25°C');

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
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 7, completion: 8 });
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
      expect(result.tokenUsage).toEqual({ total: 5, prompt: 2, completion: 3 });
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

      disableCache();

      const result2 = await provider.callApi(
        JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
      );

      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      expect(result2.output).toBe('Test output');
      expect(result2.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

      enableCache();
    });

    it('should identify reasoning models correctly', () => {
      const regularProvider = new OpenAiChatCompletionProvider('gpt-4');
      const o1Provider = new OpenAiChatCompletionProvider('o1-mini');
      const o3Provider = new OpenAiChatCompletionProvider('o3-mini');
      const o1PreviewProvider = new OpenAiChatCompletionProvider('o1-preview');

      expect(regularProvider['isReasoningModel']()).toBe(false);
      expect(o1Provider['isReasoningModel']()).toBe(true);
      expect(o3Provider['isReasoningModel']()).toBe(true);
      expect(o1PreviewProvider['isReasoningModel']()).toBe(true);
    });

    it('should handle temperature support correctly', () => {
      const regularProvider = new OpenAiChatCompletionProvider('gpt-4');
      const o1Provider = new OpenAiChatCompletionProvider('o1-mini');
      const o3Provider = new OpenAiChatCompletionProvider('o3-mini');
      const o1PreviewProvider = new OpenAiChatCompletionProvider('o1-preview');

      expect(regularProvider['supportsTemperature']()).toBe(true);
      expect(o1Provider['supportsTemperature']()).toBe(false);
      expect(o3Provider['supportsTemperature']()).toBe(false);
      expect(o1PreviewProvider['supportsTemperature']()).toBe(false);
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
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5 });
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
      expect(result.tokenUsage).toEqual({ total: 12, prompt: 8, completion: 4 });
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
      expect(result.tokenUsage).toEqual({ total: 18, prompt: 12, completion: 6 });
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
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    });
  });
});
