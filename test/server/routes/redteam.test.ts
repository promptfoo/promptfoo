import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies
vi.mock('../../../src/redteam/plugins/index');
vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/redteam/shared');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('../../../src/util/fetch/index');
vi.mock('../../../src/server/services/redteamTestCaseGenerationService');

// Import after mocking
import logger from '../../../src/logger';
import { Plugins } from '../../../src/redteam/plugins/index';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { doRedteamRun } from '../../../src/redteam/shared';
import { Strategies } from '../../../src/redteam/strategies/index';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../../../src/server/services/redteamTestCaseGenerationService';
import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedPlugins = vi.mocked(Plugins);
const mockedRedteamProviderManager = vi.mocked(redteamProviderManager);
const mockedGetPluginConfigurationError = vi.mocked(getPluginConfigurationError);
const mockedExtractGeneratedPrompt = vi.mocked(extractGeneratedPrompt);
const mockedGenerateMultiTurnPrompt = vi.mocked(generateMultiTurnPrompt);
const mockedDoRedteamRun = vi.mocked(doRedteamRun);
const mockedGetRemoteGenerationUrl = vi.mocked(getRemoteGenerationUrl);
const mockedNeverGenerateRemote = vi.mocked(neverGenerateRemote);
const mockedFetchWithProxy = vi.mocked(fetchWithProxy);
const debugSpy = vi.spyOn(logger, 'debug');

describe('Redteam Routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  describe('POST /redteam/generate-test', () => {
    beforeEach(() => {
      vi.resetAllMocks();

      // Default mock implementations
      mockedGetPluginConfigurationError.mockReturnValue(null);
      mockedRedteamProviderManager.getProvider.mockResolvedValue({
        id: () => 'test-provider',
        callApi: vi.fn(),
      } as any);
      mockedExtractGeneratedPrompt.mockReturnValue('generated test prompt');
    });

    describe('excluded plugins logic', () => {
      it('should NOT exclude dataset-exempt plugins without multi-input config', async () => {
        // 'aegis' is a DATASET_EXEMPT_PLUGIN but should work without multi-input
        const mockPluginFactory = {
          key: 'aegis',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'aegis',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        // Should have called the plugin factory action (not excluded)
        expect(mockPluginFactory.action).toHaveBeenCalled();
        expect(response.body.prompt).toBe('generated test prompt');
      });

      it('should default missing application purpose for generated tests', async () => {
        const mockPluginFactory = {
          key: 'aegis',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'aegis',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {},
            },
          });

        expect(response.status).toBe(200);
        expect(mockPluginFactory.action).toHaveBeenCalledWith(
          expect.objectContaining({ purpose: 'general AI assistant' }),
        );
        expect(response.body.prompt).toBe('generated test prompt');
      });

      it('should exclude dataset-exempt plugins with multi-input config', async () => {
        // 'beavertails' is a DATASET_EXEMPT_PLUGIN - should be excluded with inputs
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'beavertails',
              config: {
                inputs: { query: 'user query', context: 'additional context' },
              },
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ testCases: [], count: 0 });
      });

      it('should exclude multi-input excluded plugins when plugin has multi-input config', async () => {
        // 'cca' is a MULTI_INPUT_EXCLUDED_PLUGIN - should be excluded only with multi-input
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'cca',
              config: {
                inputs: { query: 'user query', context: 'additional context' },
              },
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ testCases: [], count: 0 });
      });

      it('should NOT exclude multi-input excluded plugins when plugin has no multi-input config', async () => {
        // 'cca' is a MULTI_INPUT_EXCLUDED_PLUGIN - should NOT be excluded without multi-input
        const mockPluginFactory = {
          key: 'cca',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'cca',
              config: {}, // No inputs - should not be excluded
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        // Should have called the plugin factory action (not returned early)
        expect(mockPluginFactory.action).toHaveBeenCalled();
        // Single test case returns 'prompt' instead of 'testCases' array
        expect(response.body.prompt).toBe('generated test prompt');
      });

      it('should NOT exclude multi-input excluded plugins when inputs is empty object', async () => {
        // Empty inputs object should not trigger multi-input exclusion
        const mockPluginFactory = {
          key: 'cross-session-leak',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'cross-session-leak',
              config: {
                inputs: {}, // Empty inputs - should not be excluded
              },
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        // Should have called the plugin factory action (not returned early)
        expect(mockPluginFactory.action).toHaveBeenCalled();
      });

      it('should not exclude system-prompt-override with multi-input config', async () => {
        const mockPluginFactory = {
          key: 'system-prompt-override',
          action: vi.fn().mockResolvedValue([{ vars: { __prompt: 'test' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'system-prompt-override',
              config: {
                inputs: { systemPrompt: 'system', userInput: 'user' },
              },
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        expect(mockPluginFactory.action).toHaveBeenCalled();
        expect(response.body.prompt).toBe('generated test prompt');
      });

      it('should NOT exclude special-token-injection without multi-input config', async () => {
        const mockPluginFactory = {
          key: 'special-token-injection',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'special-token-injection',
              config: {}, // No inputs
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        expect(mockPluginFactory.action).toHaveBeenCalled();
      });

      it('should process regular plugins normally without inputs', async () => {
        // 'harmful:hate' is a regular plugin, not in any exclusion list
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test case' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        expect(mockPluginFactory.action).toHaveBeenCalled();
        // Single test case returns 'prompt' instead of 'testCases' array
        expect(response.body.prompt).toBe('generated test prompt');
      });

      it('should process regular plugins normally with multi-input config', async () => {
        // Regular plugins with inputs should still be processed
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test case' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {
                inputs: { query: 'user input', context: 'context' },
              },
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        expect(mockPluginFactory.action).toHaveBeenCalled();
        expect(response.body.prompt).toBe('generated test prompt');
      });

      it('should preserve HarmBench category filters when generating preview tests', async () => {
        const mockPluginFactory = {
          key: 'harmbench',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test case' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmbench',
              config: {
                categories: ['misinformation'],
                functionalCategories: ['contextual'],
              },
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(200);
        expect(mockPluginFactory.action).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              categories: ['misinformation'],
              functionalCategories: ['contextual'],
              language: 'en',
              __nonce: expect.any(Number),
            }),
          }),
        );
        expect(response.body.prompt).toBe('generated test prompt');
      });
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    describe('generation token usage', () => {
      it.each([1, 3])('returns plugin generation usage for count %s', async (count) => {
        const callApi = vi.fn().mockResolvedValue({
          output: 'Prompt: generated test prompt',
          tokenUsage: { total: 3, prompt: 2, completion: 1, numRequests: 1 },
        });
        mockedRedteamProviderManager.getProvider.mockResolvedValue({
          id: () => 'test-provider',
          callApi,
        } as any);
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockImplementation(async ({ provider }) => {
            await provider.callApi('generate tests');
            return Array.from({ length: count }, () => ({ vars: { query: 'test' } }));
          }),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'harmful:hate', config: {} },
            strategy: { id: 'basic', config: {} },
            config: { applicationDefinition: { purpose: 'test assistant' } },
            count,
          });

        expect(response.status).toBe(200);
        expect(callApi).toHaveBeenCalledTimes(1);
        expect(response.body.tokenUsage).toEqual({
          total: 3,
          prompt: 2,
          completion: 1,
          cached: 0,
          numRequests: 1,
        });
      });

      it('returns combined plugin and multi-turn generation usage', async () => {
        const callApi = vi.fn().mockResolvedValue({
          output: 'Prompt: generated test prompt',
          tokenUsage: { total: 3, prompt: 2, completion: 1, numRequests: 1 },
        });
        mockedRedteamProviderManager.getProvider.mockResolvedValue({
          id: () => 'test-provider',
          callApi,
        } as any);
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockImplementation(async ({ provider }) => {
            await provider.callApi('generate test');
            return [{ vars: { query: 'test' }, metadata: { goal: 'test goal' } }];
          }),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);
        mockedGenerateMultiTurnPrompt.mockResolvedValue({
          prompt: 'next prompt',
          metadata: { mischievousUser: { tokenUsage: { total: 7 } } },
          tokenUsage: { total: 7, prompt: 4, completion: 3 },
        } as any);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'harmful:hate', config: {} },
            strategy: { id: 'mischievous-user', config: {} },
            config: { applicationDefinition: { purpose: 'test assistant' } },
          });

        expect(response.status).toBe(200);
        expect(response.body.prompt).toBe('next prompt');
        expect(response.body.tokenUsage).toEqual({
          total: 10,
          prompt: 6,
          completion: 4,
          cached: 0,
          numRequests: 2,
        });
      });

      it('includes provider usage from a generation-time strategy', async () => {
        const pluginCallApi = vi.fn().mockResolvedValue({
          output: 'Prompt: generated test prompt',
          tokenUsage: { total: 3, prompt: 2, completion: 1, numRequests: 1 },
        });
        const strategyCallApi = vi.fn().mockResolvedValue({
          output: 'strategy output',
          tokenUsage: { total: 9, prompt: 5, completion: 4, numRequests: 1 },
        });
        mockedRedteamProviderManager.getProvider.mockResolvedValue({
          id: () => 'plugin-provider',
          callApi: pluginCallApi,
        } as any);
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockImplementation(async ({ provider }) => {
            await provider.callApi('generate test');
            return [{ vars: { query: 'test' } }];
          }),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);
        const strategyFindSpy = vi.spyOn(Strategies, 'find').mockReturnValue({
          id: 'math-prompt',
          action: vi.fn().mockImplementation(async (testCases, _injectVar, config) => {
            const provider = config.__wrapGenerationProvider({
              id: () => 'strategy-provider',
              callApi: strategyCallApi,
            });
            await provider.callApi('transform test');
            return testCases;
          }),
        } as any);

        try {
          const response = await request(app)
            .post('/api/redteam/generate-test')
            .send({
              plugin: { id: 'harmful:hate', config: {} },
              strategy: { id: 'math-prompt', config: {} },
              config: { applicationDefinition: { purpose: 'test assistant' } },
            });

          expect(response.status).toBe(200);
          expect(pluginCallApi).toHaveBeenCalledTimes(1);
          expect(strategyCallApi).toHaveBeenCalledTimes(1);
          expect(response.body.tokenUsage).toEqual({
            total: 12,
            prompt: 7,
            completion: 5,
            cached: 0,
            numRequests: 2,
          });
        } finally {
          strategyFindSpy.mockRestore();
        }
      });

      it.each([
        'empty plugin result',
        'plugin throw',
        'strategy throw',
        'multi-turn failure',
      ])('preserves tracked usage when generation fails with %s', async (failureMode) => {
        const usage = { total: 17, prompt: 10, completion: 7, numRequests: 1 };
        mockedRedteamProviderManager.getProvider.mockResolvedValue({
          id: () => 'test-provider',
          callApi: vi.fn().mockResolvedValue({ output: 'generated', tokenUsage: usage }),
        } as any);
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockImplementation(async ({ provider }) => {
            await provider.callApi('generate test');
            if (failureMode === 'plugin throw') {
              throw new Error('plugin failed after generation');
            }
            return failureMode === 'empty plugin result'
              ? []
              : [{ vars: { query: 'generated prompt' }, metadata: { goal: 'test goal' } }];
          }),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);
        const strategyId =
          failureMode === 'strategy throw'
            ? 'math-prompt'
            : failureMode === 'multi-turn failure'
              ? 'mischievous-user'
              : 'basic';
        const strategyFindSpy =
          failureMode === 'strategy throw'
            ? vi.spyOn(Strategies, 'find').mockReturnValue({
                id: 'math-prompt',
                action: vi.fn().mockImplementation(async (_testCases, _injectVar, config) => {
                  const provider = config.__wrapGenerationProvider({
                    id: () => 'strategy-provider',
                    callApi: vi.fn().mockResolvedValue({ output: 'strategy', tokenUsage: usage }),
                  });
                  await provider.callApi('transform test');
                  throw new Error('strategy failed after generation');
                }),
              } as any)
            : undefined;
        if (failureMode === 'multi-turn failure') {
          mockedGenerateMultiTurnPrompt.mockRejectedValueOnce(
            Object.assign(new Error('multi-turn failed after generation'), { tokenUsage: usage }),
          );
        }

        try {
          const response = await request(app)
            .post('/api/redteam/generate-test')
            .send({
              plugin: { id: 'harmful:hate', config: {} },
              strategy: { id: strategyId, config: {} },
              config: { applicationDefinition: { purpose: 'test assistant' } },
            });

          expect(response.status).toBe(500);
          expect(response.body.tokenUsage).toEqual({
            total:
              failureMode === 'strategy throw' || failureMode === 'multi-turn failure' ? 34 : 17,
            prompt:
              failureMode === 'strategy throw' || failureMode === 'multi-turn failure' ? 20 : 10,
            completion:
              failureMode === 'strategy throw' || failureMode === 'multi-turn failure' ? 14 : 7,
            cached: 0,
            numRequests:
              failureMode === 'strategy throw' || failureMode === 'multi-turn failure' ? 2 : 1,
          });
        } finally {
          strategyFindSpy?.mockRestore();
        }
      });

      it('counts a successful multi-turn request when the remote reports zero requests', async () => {
        mockedPlugins.find = vi.fn().mockReturnValue({
          key: 'harmful:hate',
          action: vi
            .fn()
            .mockResolvedValue([
              { vars: { query: 'generated prompt' }, metadata: { goal: 'goal' } },
            ]),
        });
        mockedGenerateMultiTurnPrompt.mockResolvedValueOnce({
          prompt: 'next prompt',
          metadata: {},
          tokenUsage: { total: 7, prompt: 4, completion: 3, numRequests: 0 },
        } as any);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'harmful:hate', config: {} },
            strategy: { id: 'mischievous-user', config: {} },
            config: { applicationDefinition: { purpose: 'test assistant' } },
          });

        expect(response.status).toBe(200);
        expect(response.body.tokenUsage).toEqual({
          total: 7,
          prompt: 4,
          completion: 3,
          cached: 0,
          numRequests: 1,
        });
      });

      it('counts an unmetered failed multi-turn request', async () => {
        mockedPlugins.find = vi.fn().mockReturnValue({
          key: 'harmful:hate',
          action: vi
            .fn()
            .mockResolvedValue([
              { vars: { query: 'generated prompt' }, metadata: { goal: 'goal' } },
            ]),
        });
        mockedGenerateMultiTurnPrompt.mockRejectedValueOnce(new Error('multi-turn request failed'));

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'harmful:hate', config: {} },
            strategy: { id: 'mischievous-user', config: {} },
            config: { applicationDefinition: { purpose: 'test assistant' } },
          });

        expect(response.status).toBe(500);
        expect(response.body.tokenUsage).toMatchObject({ numRequests: 1 });
      });

      it('does not count a multi-turn request when remote generation is disabled', async () => {
        mockedPlugins.find = vi.fn().mockReturnValue({
          key: 'harmful:hate',
          action: vi
            .fn()
            .mockResolvedValue([
              { vars: { query: 'generated prompt' }, metadata: { goal: 'goal' } },
            ]),
        });
        mockedGenerateMultiTurnPrompt.mockRejectedValueOnce(new RemoteGenerationDisabledError());

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'harmful:hate', config: {} },
            strategy: { id: 'mischievous-user', config: {} },
            config: { applicationDefinition: { purpose: 'test assistant' } },
          });

        expect(response.status).toBe(400);
        expect(response.body.tokenUsage?.numRequests ?? 0).toBe(0);
      });

      it('preserves validated usage carried by an unwrapped plugin error', async () => {
        mockedPlugins.find = vi.fn().mockReturnValue({
          key: 'harmful:hate',
          action: vi.fn().mockRejectedValue(
            Object.assign(new Error('remote plugin failed'), {
              tokenUsage: { total: 17, prompt: 10, completion: 7, numRequests: 1 },
            }),
          ),
        });

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'harmful:hate', config: {} },
            strategy: { id: 'basic', config: {} },
            config: { applicationDefinition: { purpose: 'test assistant' } },
          });

        expect(response.status).toBe(500);
        expect(response.body.tokenUsage).toEqual({
          total: 17,
          prompt: 10,
          completion: 7,
          cached: 0,
          numRequests: 1,
        });
      });
    });

    describe('validation', () => {
      it('should return 400 for invalid plugin ID', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'invalid-plugin-id',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid plugin ID');
      });

      it('should return 400 for invalid strategy ID', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'invalid-strategy',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid strategy ID');
      });

      it('should return 400 for plugin configuration error', async () => {
        mockedGetPluginConfigurationError.mockReturnValue(
          'Plugin requires additional configuration',
        );

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Plugin requires additional configuration');
      });
    });
  });

  describe('POST /redteam/run', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      mockedDoRedteamRun.mockResolvedValue(undefined as any);
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should return job id for valid request', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: { purpose: 'test' },
          force: true,
          verbose: false,
          delay: 0,
          maxConcurrency: 2,
        });

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(typeof response.body.id).toBe('string');
      expect(mockedDoRedteamRun).toHaveBeenCalled();
    });

    it('should publish a completed redteam eval through the eval job endpoint', async () => {
      const summary = { results: [] };
      mockedDoRedteamRun.mockResolvedValueOnce({
        id: 'redteam-eval-id',
        toEvaluateSummary: vi.fn().mockResolvedValue(summary),
      } as any);

      const runResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' } });
      expect(runResponse.status).toBe(200);

      await vi.waitFor(async () => {
        const completedResponse = await request(app).get(`/api/eval/job/${runResponse.body.id}`);
        expect(completedResponse.body).toMatchObject({
          status: 'complete',
          evalId: 'redteam-eval-id',
          result: summary,
        });
      });
    });

    it('should publish logs and cancellation through the eval job endpoint', async () => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );

      const runResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' } });
      expect(runResponse.status).toBe(200);

      const runArgs = mockedDoRedteamRun.mock.calls[0][0];
      runArgs.logCallback?.('working');

      const inProgressResponse = await request(app).get(`/api/eval/job/${runResponse.body.id}`);
      expect(inProgressResponse.body).toMatchObject({
        status: 'in-progress',
        logs: ['working'],
      });

      const cancelResponse = await request(app).post('/api/redteam/cancel');
      expect(cancelResponse.status).toBe(200);

      const cancelledResponse = await request(app).get(`/api/eval/job/${runResponse.body.id}`);
      expect(cancelledResponse.body).toMatchObject({
        status: 'error',
        logs: ['working', 'Job cancelled by user'],
      });

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const settledResponse = await request(app).get(`/api/eval/job/${runResponse.body.id}`);
        expect(settledResponse.body).toMatchObject({
          status: 'error',
          logs: ['working', 'Job cancelled by user'],
        });
      });
    });

    it('should keep a replaced job cancelled when its stale run settles', async () => {
      let resolveFirstRun: ((value: any) => void) | undefined;
      let resolveSecondRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirstRun = resolve;
          }),
        )
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveSecondRun = resolve;
          }),
        );

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      const secondResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'second' } });
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);

      const cancelledResponse = await request(app).get(`/api/eval/job/${firstResponse.body.id}`);
      expect(cancelledResponse.body).toMatchObject({
        status: 'error',
        logs: ['Job cancelled - new job started'],
      });

      const toEvaluateSummary = vi.fn().mockResolvedValue({ results: [] });
      resolveFirstRun!({
        id: 'stale-redteam-eval-id',
        toEvaluateSummary,
      });
      await vi.waitFor(async () => {
        const settledResponse = await request(app).get(`/api/eval/job/${firstResponse.body.id}`);
        expect(settledResponse.body).toMatchObject({
          status: 'error',
          logs: ['Job cancelled - new job started'],
        });
      });
      expect(toEvaluateSummary).toHaveBeenCalledOnce();

      resolveSecondRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({
          hasRunningJob: false,
          jobId: null,
        });
      });
    });

    it('should preserve streamed logs when the background run rejects', async () => {
      mockedDoRedteamRun.mockImplementationOnce(async ({ logCallback }) => {
        logCallback?.('working');
        throw new Error('run failed');
      });

      const runResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' } });
      expect(runResponse.status).toBe(200);

      await vi.waitFor(async () => {
        const failedResponse = await request(app).get(`/api/eval/job/${runResponse.body.id}`);
        expect(failedResponse.body).toMatchObject({
          status: 'error',
          logs: expect.arrayContaining(['working', 'Error: run failed']),
        });
      });
    });

    it('should not force runtime defaults when delay and maxConcurrency are omitted', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: { purpose: 'test' },
        });

      expect(response.status).toBe(200);
      const runArgs = mockedDoRedteamRun.mock.calls[0][0];
      expect(runArgs.liveRedteamConfig).toEqual({ purpose: 'test' });
      expect(runArgs).not.toHaveProperty('delay');
      expect(runArgs).not.toHaveProperty('maxConcurrency');
    });

    it('should return 400 when config is missing', async () => {
      const response = await request(app).post('/api/redteam/run').send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when config is not an object', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({ config: 'not-an-object' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when force is not a boolean', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' }, force: 'yes' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept string delay and maxConcurrency', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: { purpose: 'test' },
          delay: '100',
          maxConcurrency: '4',
        });

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
    });

    it('should return 400 when delay is a non-numeric string', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' }, delay: 'abc' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when maxConcurrency is a non-numeric string', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' }, maxConcurrency: 'abc' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when maxConcurrency is less than 1', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' }, maxConcurrency: 0 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when delay is negative', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'test' }, delay: -1 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /redteam/:taskId', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      debugSpy.mockClear();
      mockedGetRemoteGenerationUrl.mockReturnValue('https://api.example.com/task');
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should proxy valid request to cloud', async () => {
      mockedFetchWithProxy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'success' }),
      } as any);

      const response = await request(app).post('/api/redteam/my-task').send({ data: 'test' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ result: 'success' });
      expect(mockedFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/task',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: 'test', task: 'my-task' }),
        }),
      );
    });

    it('should not proxy task bodies when remote generation is disabled', async () => {
      mockedNeverGenerateRemote.mockReturnValue(true);

      const response = await request(app).post('/api/redteam/my-task').send({ data: 'test' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Requires remote generation be enabled.',
      });
      expect(mockedGetRemoteGenerationUrl).not.toHaveBeenCalled();
      expect(mockedFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should log task metadata without stringifying the body', async () => {
      mockedFetchWithProxy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'success' }),
      } as any);

      const response = await request(app).post('/api/redteam/my-task').send({
        data: 'test',
        secret: 'value',
      });

      expect(response.status).toBe(200);
      expect(debugSpy).toHaveBeenCalledWith(
        'Received my-task task request',
        expect.objectContaining({
          method: 'POST',
          url: '/my-task',
          body: expect.objectContaining({
            data: 'test',
            secret: '[REDACTED]',
          }),
        }),
      );
    });

    it('should return 500 when cloud function fails', async () => {
      mockedFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 503,
      } as any);

      const response = await request(app).post('/api/redteam/my-task').send({ data: 'test' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to process my-task task');
    });

    it('should return 400 when taskId exceeds max length', async () => {
      const longTaskId = 'a'.repeat(129);
      const response = await request(app).post(`/api/redteam/${longTaskId}`).send({ data: 'test' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept body with various shapes', async () => {
      mockedFetchWithProxy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as any);

      const response = await request(app)
        .post('/api/redteam/some-task')
        .send({ nested: { deep: true }, list: [1, 2, 3] });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /redteam/cancel', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should return 400 when no job is running', async () => {
      const response = await request(app).post('/api/redteam/cancel');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No job currently running');
    });
  });

  describe('GET /redteam/status', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should return status shape', async () => {
      const response = await request(app).get('/api/redteam/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hasRunningJob');
      expect(response.body).toHaveProperty('jobId');
      expect(response.body.hasRunningJob).toBe(false);
      expect(response.body.jobId).toBeNull();
    });
  });
});
