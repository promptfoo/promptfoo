import Groq from 'groq-sdk';
import { clearCache, disableCache, enableCache } from '../src/cache';
import { GroqProvider } from '../src/providers/groq';

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
jest.mock('../src/logger');

describe('Groq', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('GroqProvider', () => {
    const provider = new GroqProvider('mixtral-8x7b-32768');

    it('should initialize with correct model name', () => {
      expect(provider.modelName).toBe('mixtral-8x7b-32768');
    });

    it('should return correct id', () => {
      expect(provider.id()).toBe('groq:mixtral-8x7b-32768');
    });

    it('should return correct string representation', () => {
      expect(provider.toString()).toBe('[Groq Provider mixtral-8x7b-32768]');
    });

    describe('callApi', () => {
      it('should call Groq API and return output', async () => {
        const mockResponse = {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (jest.mocked(Groq)).mockImplementation(
          () =>
            ({
              chat: {
                completions: {
                  create: mockCreate,
                },
              },
            }) as any,
        );

        const result = await provider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'user',
                content: 'Test prompt',
              }),
            ]),
            model: 'mixtral-8x7b-32768',
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
        (jest.mocked(Groq)).mockImplementation(
          () =>
            ({
              chat: {
                completions: {
                  create: mockCreate,
                },
              },
            }) as any,
        );

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
        (jest.mocked(Groq)).mockImplementation(
          () =>
            ({
              chat: {
                completions: {
                  create: mockCreate,
                },
              },
            }) as any,
        );

        disableCache();

        const result1 = await provider.callApi('Test prompt');
        const result2 = await provider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(result1).toEqual(result2);
        expect(result1.tokenUsage).not.toHaveProperty('cached');

        enableCache();
      });

      it('should handle API errors', async () => {
        const mockError = new Error('API Error');
        mockError.name = 'APIError';
        (mockError as any).status = 400;
        const mockCreate = jest.fn().mockRejectedValue(mockError);
        (jest.mocked(Groq)).mockImplementation(
          () =>
            ({
              chat: {
                completions: {
                  create: mockCreate,
                },
              },
            }) as any,
        );

        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          error: 'API call error: 400 APIError: API Error',
        });
      });

      it('should handle non-API errors', async () => {
        const mockError = new Error('Unknown error');
        const mockCreate = jest.fn().mockRejectedValue(mockError);
        (jest.mocked(Groq)).mockImplementation(
          () =>
            ({
              chat: {
                completions: {
                  create: mockCreate,
                },
              },
            }) as any,
        );

        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          error: 'API call error: Error: Unknown error',
        });
      });

      it('should pass custom configuration options', async () => {
        const customProvider = new GroqProvider('mixtral-8x7b-32768', {
          config: {
            temperature: 0.7,
            max_tokens: 100,
            top_p: 0.9,
          },
        });

        const mockResponse = {
          choices: [{ message: { content: 'Custom output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };
        const mockCreate = jest.fn().mockResolvedValue(mockResponse);
        (jest.mocked(Groq)).mockImplementation(
          () =>
            ({
              chat: {
                completions: {
                  create: mockCreate,
                },
              },
            }) as any,
        );

        await customProvider.callApi('Test prompt');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 0.7,
            max_tokens: 100,
            top_p: 0.9,
          }),
        );
      });
    });
  });
});
