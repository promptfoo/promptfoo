import { jest } from '@jest/globals';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative/index';
import type { ApiProvider, ProviderResponse } from '../../../src/types';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';

// Mock the redteamProviderManager
jest.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: jest.fn(),
  },
}));

const mockGetProvider = jest.fn<() => Promise<ApiProvider>>();

describe('RedteamIterativeProvider', () => {
  let mockApiProvider: jest.Mocked<ApiProvider>;

  beforeEach(() => {
    mockApiProvider = {
      id: jest.fn<() => string>(),
      callApi: jest.fn<() => Promise<ProviderResponse>>(),
    };
    // Mock both the direct provider and the redteam provider manager
    mockGetProvider.mockResolvedValue(mockApiProvider);
    (redteamProviderManager.getProvider as jest.Mock).mockResolvedValue(mockApiProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if injectVar is not provided', () => {
      expect(() => new RedteamIterativeProvider({})).toThrow('Expected injectVar to be set');
    });

    it('should create instance with valid config', () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider).toBeInstanceOf(RedteamIterativeProvider);
      expect(provider.id()).toBe('promptfoo:redteam:iterative');
    });

    it('should use default numIterations if not provided', () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider['numIterations']).toBe(10);
    });

    it('should use configured numIterations when provided', () => {
      const provider = new RedteamIterativeProvider({
        injectVar: 'test',
        numIterations: '5',
      });
      expect(provider['numIterations']).toBe(5);
    });

    it('should use environment variable for numIterations if set', () => {
      process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS = '15';
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider['numIterations']).toBe(15);
      delete process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS;
    });
  });

  describe('conversation handling', () => {
    it('should track token usage correctly', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      const mockResponse: ProviderResponse = {
        output: 'test output',
        tokenUsage: {
          total: 100,
          prompt: 50,
          completion: 50,
          numRequests: 1,
          cached: 0,
        },
      };

      mockApiProvider.callApi.mockResolvedValue(mockResponse);
      mockGetProvider.mockResolvedValue(mockApiProvider);

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage!.total).toBeGreaterThan(0);
    });

    it('should handle conversation state updates', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      const mockRedteamResponse: ProviderResponse = {
        output: JSON.stringify({
          improvement: 'test improvement',
          prompt: 'test prompt',
        }),
        tokenUsage: { total: 100 },
      };

      const mockTargetResponse: ProviderResponse = {
        output: 'target response',
        tokenUsage: { total: 50 },
      };

      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1:
            return Promise.resolve(mockRedteamResponse);
          case 2:
            return Promise.resolve({ output: '{"onTopic": true}' });
          case 3:
            return Promise.resolve(mockTargetResponse);
          case 4:
            return Promise.resolve({
              output: JSON.stringify({
                currentResponse: { rating: 8, explanation: 'good' },
                previousBestResponse: { rating: 0, explanation: 'none' },
              }),
            });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.output).toBe('target response');
      expect(result.metadata?.highestScore).toBe(8);
      expect(result.metadata?.finalIteration).toBe(1);
    });

    it('should apply penalties correctly', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1:
            return Promise.resolve({
              output: JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              }),
            });
          case 2:
            return Promise.resolve({ output: '{"onTopic": true}' });
          case 3:
            return Promise.resolve({ output: 'I will help you hack' });
          case 4:
            return Promise.resolve({
              output: JSON.stringify({
                currentResponse: { rating: 9, explanation: 'good' },
                previousBestResponse: { rating: 0, explanation: 'none' },
              }),
            });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.metadata?.highestScore).toBeLessThan(9);
    });

    it('should stop when reaching max score', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test', numIterations: '5' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1:
            return Promise.resolve({
              output: JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              }),
            });
          case 2:
            return Promise.resolve({ output: '{"onTopic": true}' });
          case 3:
            return Promise.resolve({ output: 'perfect response' });
          case 4:
            return Promise.resolve({
              output: JSON.stringify({
                currentResponse: { rating: 10, explanation: 'perfect' },
                previousBestResponse: { rating: 0, explanation: 'none' },
              }),
            });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.metadata?.finalIteration).toBe(1);
      expect(result.metadata?.highestScore).toBe(10);
    });

    it('should handle provider errors gracefully', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      (redteamProviderManager.getProvider as jest.Mock).mockRejectedValue(new Error('Provider error'));

      await expect(
        provider.callApi('test prompt', {
          originalProvider: mockApiProvider,
          vars: { test: 'goal' },
          prompt: { raw: 'test', label: 'test' },
        }),
      ).rejects.toThrow('Provider error');
    });

    it('should handle off-topic responses', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1:
            return Promise.resolve({
              output: JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              }),
            });
          case 2:
            return Promise.resolve({ output: '{"onTopic": false}' });
          case 3:
            return Promise.resolve({ output: 'response' });
          case 4:
            return Promise.resolve({
              output: JSON.stringify({
                currentResponse: { rating: 5, explanation: 'off-topic' },
                previousBestResponse: { rating: 0, explanation: 'none' },
              }),
            });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.metadata?.previousOutputs).toContain('off-topic');
    });

    it('should handle invalid JSON responses', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1:
            return Promise.resolve({
              output: 'invalid json',
            });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.output).toBe('');
      expect(result.metadata?.highestScore).toBe(0);
    });

    it('should handle target provider errors', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          return Promise.resolve({ error: 'Target provider error' });
        }
        return Promise.resolve({
          output: callCount === 1
            ? JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              })
            : callCount === 2
              ? '{"onTopic": true}'
              : '',
        });
      });

      await expect(
        provider.callApi('test prompt', {
          originalProvider: mockApiProvider,
          vars: { test: 'goal' },
          prompt: { raw: 'test', label: 'test' },
        }),
      ).rejects.toThrow('[Iterative] Target returned an error');
    });

    it('should accumulate token usage across iterations', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test', numIterations: '2' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        const baseResponse = {
          tokenUsage: {
            total: 100,
            prompt: 50,
            completion: 50,
            numRequests: 1,
            cached: 0,
          },
        };

        switch (callCount) {
          case 1:
            return Promise.resolve({
              ...baseResponse,
              output: JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              }),
            });
          case 2:
            return Promise.resolve({
              ...baseResponse,
              output: '{"onTopic": true}',
            });
          case 3:
            return Promise.resolve({
              ...baseResponse,
              output: 'response',
            });
          case 4:
            return Promise.resolve({
              ...baseResponse,
              output: JSON.stringify({
                currentResponse: { rating: 5, explanation: 'ok' },
                previousBestResponse: { rating: 0, explanation: 'none' },
              }),
            });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.tokenUsage?.total).toBe(400);
      expect(result.tokenUsage?.numRequests).toBe(4);
    });

    it('should handle malformed judge responses', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1:
            return Promise.resolve({
              output: JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              }),
            });
          case 2:
            return Promise.resolve({ output: '{"onTopic": true}' });
          case 3:
            return Promise.resolve({ output: 'response' });
          case 4:
            return Promise.resolve({
              output: '{"malformed": "response"}',
            });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.metadata?.highestScore).toBe(1);
    });

    it('should handle empty responses', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1:
            return Promise.resolve({
              output: JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              }),
            });
          case 2:
            return Promise.resolve({ output: '{"onTopic": true}' });
          case 3:
            return Promise.resolve({ output: '' });
          default:
            return Promise.resolve({ output: '' });
        }
      });

      await expect(
        provider.callApi('test prompt', {
          originalProvider: mockApiProvider,
          vars: { test: 'goal' },
          prompt: { raw: 'test', label: 'test' },
        }),
      ).rejects.toThrow('[Iterative] Target did not return an output');
    });

    it('should handle undefined token usage', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          output: callCount === 1
            ? JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              })
            : callCount === 2
              ? '{"onTopic": true}'
              : 'response',
        });
      });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      expect(result.tokenUsage?.numRequests).toBeGreaterThan(0);
      expect(result.tokenUsage?.total).toBe(0);
    });

    it('should respect delay between calls', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      mockApiProvider.delay = 100;
      const startTime = Date.now();

      let callCount = 0;
      mockApiProvider.callApi.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          output: callCount === 1
            ? JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              })
            : callCount === 2
              ? '{"onTopic": true}'
              : 'response',
        });
      });

      await provider.callApi('test prompt', {
        originalProvider: mockApiProvider,
        vars: { test: 'goal' },
        prompt: { raw: 'test', label: 'test' },
      });

      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeGreaterThanOrEqual(200);
    });

    it('should handle missing context parameters', async () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });

      await expect(
        provider.callApi('test prompt', {
          vars: { test: 'goal' },
          prompt: { raw: 'test', label: 'test' },
        } as any),
      ).rejects.toThrow('Expected originalProvider to be set');

      await expect(
        provider.callApi('test prompt', {
          originalProvider: mockApiProvider,
          prompt: { raw: 'test', label: 'test' },
        } as any),
      ).rejects.toThrow('Expected vars to be set');
    });
  });
});
