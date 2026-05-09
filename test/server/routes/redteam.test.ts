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
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
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
      mockedGenerateMultiTurnPrompt.mockResolvedValue({
        prompt: 'generated multi-turn prompt',
        metadata: {},
      });
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

      it('should exclude system-prompt-override with multi-input config', async () => {
        // 'system-prompt-override' is a MULTI_INPUT_EXCLUDED_PLUGIN
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
        expect(response.body).toEqual({ testCases: [], count: 0 });
      });

      it('should NOT exclude special-token-injection without multi-input config', async () => {
        // 'special-token-injection' is a MULTI_INPUT_EXCLUDED_PLUGIN
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

    describe('generation failures', () => {
      it('should preserve one-row generation usage on successful previews', async () => {
        mockedRedteamProviderManager.getProvider.mockResolvedValue({
          id: () => 'test-provider',
          callApi: vi.fn().mockResolvedValue({
            output: 'generated',
            tokenUsage: { total: 17, prompt: 10, completion: 7, numRequests: 1 },
          }),
        } as any);
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockImplementation(async ({ provider }) => {
            await provider.callApi('prompt');
            return [{ vars: { query: 'test case' }, metadata: { pluginId: 'harmful:hate' } }];
          }),
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
        expect(response.body.metadata.providerTokenUsage).toMatchObject({
          total: 17,
          prompt: 10,
          completion: 7,
          numRequests: 1,
        });
      });

      it('should preserve generation usage when no preview cases are produced', async () => {
        mockedRedteamProviderManager.getProvider.mockResolvedValue({
          id: () => 'test-provider',
          callApi: vi.fn().mockResolvedValue({
            output: 'generated',
            tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
          }),
        } as any);
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockImplementation(async ({ provider }) => {
            await provider.callApi('prompt');
            return [];
          }),
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

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          error: 'Failed to generate test case',
          tokenUsage: {
            total: 11,
            prompt: 7,
            completion: 4,
            cached: 0,
            numRequests: 1,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
            assertions: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
              },
            },
          },
        });
      });

      it('should preserve generation usage when preview generation throws', async () => {
        mockedRedteamProviderManager.getProvider.mockResolvedValue({
          id: () => 'test-provider',
          callApi: vi.fn().mockResolvedValue({
            output: 'generated',
            tokenUsage: { total: 13, prompt: 8, completion: 5, numRequests: 1 },
          }),
        } as any);
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockImplementation(async ({ provider }) => {
            await provider.callApi('prompt');
            throw new Error('preview generation failed');
          }),
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

        expect(response.status).toBe(500);
        expect(response.body.tokenUsage).toMatchObject({
          total: 13,
          prompt: 8,
          completion: 5,
          numRequests: 1,
        });
      });
    });

    describe('multi-turn generation failures', () => {
      it('should preserve helper usage on multi-turn generation errors', async () => {
        const mockPluginFactory = {
          key: 'harmful:hate',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test case' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);
        mockedGenerateMultiTurnPrompt.mockRejectedValue(
          Object.assign(new Error('Hydra task failed'), {
            tokenUsage: {
              total: 13,
              prompt: 8,
              completion: 5,
              numRequests: 1,
            },
          }),
        );

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'jailbreak:hydra',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          error: 'Failed to generate multi-turn prompt',
          tokenUsage: { total: 13, prompt: 8, completion: 5, numRequests: 1 },
        });
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
        json: () => Promise.resolve({ error: 'upstream failed' }),
      } as any);

      const response = await request(app).post('/api/redteam/my-task').send({ data: 'test' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to process my-task task');
    });

    it('should preserve helper usage when proxied cloud tasks fail', async () => {
      mockedFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'Warning',
            message: 'Skipping generation',
            tokenUsage: { total: 9, prompt: 5, completion: 4, numRequests: 1 },
          }),
      } as any);

      const response = await request(app).post('/api/redteam/my-task').send({ data: 'test' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to process my-task task',
        tokenUsage: { total: 9, prompt: 5, completion: 4, numRequests: 1 },
      });
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
