import fs from 'fs';
import os from 'os';
import path from 'path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies
vi.mock('../../../src/redteam/plugins/index');
vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/redteam/shared', async () => ({
  ...(await vi.importActual('../../../src/redteam/shared')),
  doRedteamRun: vi.fn(),
}));
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('../../../src/util/fetch/index');
vi.mock('../../../src/server/services/redteamTestCaseGenerationService');

// Import after mocking
import logger from '../../../src/logger';
import { Plugins } from '../../../src/redteam/plugins/index';
import {
  redteamProviderManager,
  resolveRedteamTargetProviderInputMetadata,
} from '../../../src/redteam/providers/shared';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { doRedteamRun } from '../../../src/redteam/shared';
import {
  extractGeneratedPrompt,
  getPluginConfigurationError,
} from '../../../src/server/services/redteamTestCaseGenerationService';
import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedPlugins = vi.mocked(Plugins);
const mockedRedteamProviderManager = vi.mocked(redteamProviderManager);
const mockedResolveRedteamTargetProviderInputMetadata = vi.mocked(
  resolveRedteamTargetProviderInputMetadata,
);
const mockedGetPluginConfigurationError = vi.mocked(getPluginConfigurationError);
const mockedExtractGeneratedPrompt = vi.mocked(extractGeneratedPrompt);
const mockedDoRedteamRun = vi.mocked(doRedteamRun);
const mockedGetRemoteGenerationUrl = vi.mocked(getRemoteGenerationUrl);
const mockedNeverGenerateRemote = vi.mocked(neverGenerateRemote);
const mockedFetchWithProxy = vi.mocked(fetchWithProxy);
const debugSpy = vi.spyOn(logger, 'debug');

async function resolveActualTargetProviderInputs(
  providers: unknown,
  basePath?: string,
  env?: Record<string, string>,
  filter?: string,
  options: { loadDynamicProviders?: boolean } = {},
) {
  const { isProviderInputMetadataUnresolved, resolveProviderInputsForValidation } =
    await vi.importActual<typeof import('../../../src/providers')>('../../../src/providers');
  const inputs = await resolveProviderInputsForValidation(providers as any, {
    basePath,
    env,
    ...(filter === undefined ? {} : { filter }),
    loadDynamicProviders: options.loadDynamicProviders,
  });
  return { inputs, hasUnresolved: inputs.some(isProviderInputMetadataUnresolved) };
}

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

      it.each([
        ['directly', { id: 'posterior', config: {} }],
        ['directly with numTests disabled', { id: 'posterior', config: { numTests: 0 } }],
        ['inside a layer', { id: 'layer', config: { steps: ['jailbreak:hydra', 'posterior'] } }],
        [
          'inside a layer with numTests disabled',
          { id: 'layer', config: { numTests: 0, steps: ['posterior'] } },
        ],
      ])('should reject posterior %s for multi-input previews before generation', async (_label, strategy) => {
        const pluginFind = vi.fn();
        mockedPlugins.find = pluginFind;

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'policy',
              config: {
                inputs: { query: 'user query', context: 'additional context' },
              },
            },
            strategy,
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Posterior strategy does not support multi-input targets');
        expect(pluginFind).not.toHaveBeenCalled();
        expect(mockedRedteamProviderManager.getProvider).not.toHaveBeenCalled();
      });

      it('should reject user-configured internal per-turn layers before preview generation', async () => {
        const pluginFind = vi.fn();
        mockedPlugins.find = pluginFind;

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'policy', config: {} },
            strategy: {
              id: 'jailbreak:hydra',
              config: { _perTurnLayers: ['posterior'] },
            },
            config: {
              applicationDefinition: { purpose: 'test assistant' },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('"_perTurnLayers" is reserved');
        expect(pluginFind).not.toHaveBeenCalled();
        expect(mockedRedteamProviderManager.getProvider).not.toHaveBeenCalled();
      });

      it.each([
        ['directly', { id: 'posterior', config: {} }],
        ['inside a layer', { id: 'layer', config: { steps: ['posterior'] } }],
      ])('should reject posterior previews %s for plugins that exclude it', async (_label, strategy) => {
        const mockPluginFactory = {
          key: 'coding-agent:secret-env-read',
          action: vi.fn().mockResolvedValue([
            {
              vars: { query: 'canary-marker' },
              metadata: {
                pluginConfig: { excludeStrategies: ['posterior'] },
                pluginId: 'coding-agent:secret-env-read',
              },
            },
          ]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'coding-agent:secret-env-read',
              config: {},
            },
            strategy,
            config: {
              applicationDefinition: {
                purpose: 'test assistant',
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe(
          `Strategy ${strategy.id} is not compatible with plugin coding-agent:secret-env-read`,
        );
        expect(mockPluginFactory.action).not.toHaveBeenCalled();
        expect(mockedRedteamProviderManager.getProvider).not.toHaveBeenCalled();
      });

      it('rejects explicit plugin targeting mismatches before generating probes', async () => {
        const mockPluginFactory = {
          key: 'pii:direct',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'probe' } }]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'pii:direct', config: {} },
            strategy: {
              id: 'layer',
              config: { plugins: ['harmful'], steps: ['base64'] },
            },
            config: { applicationDefinition: { purpose: 'test assistant' } },
          });

        expect(response.status).toBe(400);
        expect(mockPluginFactory.action).not.toHaveBeenCalled();
        expect(mockedRedteamProviderManager.getProvider).not.toHaveBeenCalled();
      });

      it('normalizes generated intent plugin IDs before applying targeted layers', async () => {
        const mockPluginFactory = {
          key: 'intent',
          action: vi.fn().mockResolvedValue([
            {
              vars: { query: 'test intent' },
              metadata: { pluginId: 'promptfoo:redteam:intent', pluginConfig: {} },
            },
          ]),
        };
        mockedPlugins.find = vi.fn().mockReturnValue(mockPluginFactory);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: { id: 'intent', config: { intent: ['test intent'] } },
            strategy: {
              id: 'layer',
              config: { plugins: ['intent'], steps: ['base64'] },
            },
            config: { applicationDefinition: { purpose: 'test assistant' } },
          });

        expect(response.status).toBe(200);
        expect(mockPluginFactory.action).toHaveBeenCalledOnce();
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
  });

  describe('POST /redteam/run', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      mockedDoRedteamRun.mockResolvedValue(undefined as any);
      mockedResolveRedteamTargetProviderInputMetadata.mockResolvedValue({
        inputs: [],
        hasUnresolved: false,
      });
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

      const statusResponse = await request(app).get('/api/redteam/status');
      expect(statusResponse.body).toMatchObject({
        hasRunningJob: false,
        latestRunId: runResponse.body.id,
      });
    });

    it('publishes a pending run ID and reuses it for the eventual job', async () => {
      let resolvePreflight:
        | ((value: { inputs: unknown[]; hasUnresolved: boolean }) => void)
        | undefined;
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePreflight = resolve;
          }),
      );
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );

      const runResponsePromise = request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: [{ id: 'echo' }],
            redteam: { strategies: ['posterior'] },
          },
        })
        .then((response) => response);
      await vi.waitFor(() => {
        expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenCalledOnce();
      });

      const pendingStatus = await request(app).get('/api/redteam/status');
      expect(pendingStatus.body).toMatchObject({
        hasRunningJob: false,
        hasPendingRun: true,
        jobId: null,
      });
      expect(pendingStatus.body.latestRunId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      resolvePreflight!({ inputs: [], hasUnresolved: false });
      const runResponse = await runResponsePromise;
      expect(runResponse.status).toBe(200);
      expect(runResponse.body.id).toBe(pendingStatus.body.latestRunId);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const settledStatus = await request(app).get('/api/redteam/status');
        expect(settledStatus.body).toMatchObject({
          hasRunningJob: false,
          hasPendingRun: false,
          jobId: null,
          latestRunId: runResponse.body.id,
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

    it('waits for a replaced job to clean up before starting its successor', async () => {
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
      const secondResponsePromise = request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'second' } })
        .then((response) => response);
      expect(firstResponse.status).toBe(200);
      await vi.waitFor(() => {
        expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(true);
      });
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();

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

      const secondResponse = await secondResponsePromise;
      expect(secondResponse.status).toBe(200);
      expect(mockedDoRedteamRun).toHaveBeenCalledTimes(2);

      resolveSecondRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({
          hasRunningJob: false,
          jobId: null,
        });
      });
    });

    it('cancels a replacement while it waits for the previous run to clean up', async () => {
      let resolveFirstRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstRun = resolve;
        }),
      );

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const replacementResponsePromise = request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'replacement' } })
        .then((response) => response);
      await vi.waitFor(() => {
        expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(true);
      });

      const pendingStatus = await request(app).get('/api/redteam/status');
      expect(pendingStatus.body).toMatchObject({
        hasPendingRun: true,
        hasRunningJob: false,
      });

      const cancelResponse = await request(app).post('/api/redteam/cancel');
      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.message).toBe('Pending run cancelled');

      resolveFirstRun!(undefined);
      const replacementResponse = await replacementResponsePromise;
      expect(replacementResponse.status).toBe(409);
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
    });

    it.each([
      {
        label: 'direct target inputs',
        targets: [
          {
            id: 'http',
            inputs: { context: 'Reference context', question: 'User question' },
          },
        ],
      },
      {
        label: 'provider map inputs',
        targets: [
          {
            echo: {
              inputs: { context: 'Reference context', question: 'User question' },
            },
          },
        ],
      },
      {
        label: 'later target inputs',
        targets: [
          { id: 'echo' },
          {
            id: 'http',
            inputs: { context: 'Reference context', question: 'User question' },
          },
        ],
      },
    ])('should reject incompatible replacements with $label without cancelling the active job', async ({
      targets,
    }) => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        resolveActualTargetProviderInputs,
      );
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const incompatibleResponse = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets,
            redteam: {
              strategies: [
                {
                  id: 'layer',
                  config: {
                    steps: ['jailbreak:hydra', 'posterior'],
                  },
                },
              ],
            },
          },
        });

      expect(incompatibleResponse.status).toBe(400);
      expect(incompatibleResponse.body.error).toBe(
        'Posterior strategy does not support multi-input targets',
      );
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();

      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);
      const activeResponse = await request(app).get('/api/redteam/status');
      expect(activeResponse.body).toMatchObject({
        hasRunningJob: true,
        jobId: firstResponse.body.id,
      });

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it('allows multi-input runs when Posterior is excluded for every configured plugin', async () => {
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        resolveActualTargetProviderInputs,
      );

      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: [
              {
                id: 'echo',
                inputs: { context: 'Reference context', question: 'User question' },
              },
            ],
            redteam: {
              plugins: ['coding-agent:secret-env-read'],
              strategies: [{ id: 'layer', config: { steps: ['jailbreak:hydra', 'posterior'] } }],
            },
          },
        });

      expect(response.status).toBe(200);
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedResolveRedteamTargetProviderInputMetadata).not.toHaveBeenCalled();
    });

    it('uses default plugins when preflighting a targeted Posterior strategy', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: [
              {
                id: 'echo',
                inputs: { context: 'Reference context', question: 'User question' },
              },
            ],
            redteam: {
              strategies: [{ id: 'posterior', config: { plugins: ['policy'] } }],
            },
          },
        });

      expect(response.status).toBe(200);
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedResolveRedteamTargetProviderInputMetadata).not.toHaveBeenCalled();
    });

    it('treats an empty command-line plugin list as no override', async () => {
      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: [
              {
                id: 'echo',
                inputs: { context: 'Reference context', question: 'User question' },
              },
            ],
            redteam: {
              plugins: [{ id: 'harmful:hate', config: { excludeStrategies: ['posterior'] } }],
              strategies: ['posterior'],
            },
            commandLineOptions: { plugins: [] },
          },
        });

      expect(response.status).toBe(200);
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedResolveRedteamTargetProviderInputMetadata).not.toHaveBeenCalled();
    });

    it('allows multi-input runs with file-backed sequence-only intents', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-posterior-intents-'));
      const intentPath = path.join(tempDir, 'intents.json');
      fs.writeFileSync(intentPath, JSON.stringify([['first turn', 'second turn']]));

      try {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              targets: [
                {
                  id: 'echo',
                  inputs: { context: 'Reference context', question: 'User question' },
                },
              ],
              redteam: {
                plugins: [{ id: 'intent', config: { intent: `file://${intentPath}` } }],
                strategies: ['posterior'],
              },
            },
          });

        expect(response.status).toBe(200);
        expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
        expect(mockedResolveRedteamTargetProviderInputMetadata).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(tempDir, { force: true, recursive: true });
      }
    });

    it.each([
      {
        label: 'command-line strategy overrides',
        strategyConfig: {
          redteam: { strategies: ['basic'] },
          commandLineOptions: { strategies: ['posterior'] },
        },
      },
      {
        label: 'top-level strategy shorthand',
        strategyConfig: {
          redteam: { strategies: ['basic'] },
          strategies: ['posterior'],
        },
      },
    ])('should preflight $label before replacing the active job', async ({ strategyConfig }) => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        resolveActualTargetProviderInputs,
      );
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const incompatibleResponse = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: [
              {
                id: 'echo',
                inputs: { context: 'Reference context', question: 'User question' },
              },
            ],
            ...strategyConfig,
          },
        });

      expect(incompatibleResponse.status).toBe(400);
      expect(incompatibleResponse.body.error).toBe(
        'Posterior strategy does not support multi-input targets',
      );
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it('renders live environment templates before replacing the active job', async () => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        resolveActualTargetProviderInputs,
      );
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const incompatibleResponse = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            env: { ATTACK_STRATEGY: 'posterior' },
            targets: [
              {
                id: 'echo',
                inputs: { context: 'Reference context', question: 'User question' },
              },
            ],
            redteam: {
              plugins: ['harmful:hate'],
              strategies: ['{{ env.ATTACK_STRATEGY }}'],
            },
          },
        });

      expect(incompatibleResponse.status).toBe(400);
      expect(incompatibleResponse.body.error).toBe(
        'Posterior strategy does not support multi-input targets',
      );
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it('should resolve referenced target inputs before replacing the active job', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-redteam-target-'));
      const providerPath = path.join(tempDir, 'providers.yaml');
      fs.writeFileSync(
        providerPath,
        [
          'id: echo',
          'inputs:',
          '  context: Reference context',
          '  question: User question',
          '',
        ].join('\n'),
      );

      let resolveRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        resolveActualTargetProviderInputs,
      );

      try {
        const firstResponse = await request(app)
          .post('/api/redteam/run')
          .send({ config: { purpose: 'first' } });
        expect(firstResponse.status).toBe(200);

        const incompatibleResponse = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              targets: [`file://${providerPath}`],
              redteam: { strategies: ['posterior'] },
            },
          });

        expect(incompatibleResponse.status).toBe(400);
        expect(incompatibleResponse.body.error).toBe(
          'Posterior strategy does not support multi-input targets',
        );
        expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
        expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

        resolveRun!(undefined);
        await vi.waitFor(async () => {
          const statusResponse = await request(app).get('/api/redteam/status');
          expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
        });
      } finally {
        fs.rmSync(tempDir, { force: true, recursive: true });
      }
    });

    it('should preflight hydrated cloud target inputs before replacing the active job', async () => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );
      mockedResolveRedteamTargetProviderInputMetadata.mockResolvedValueOnce({
        inputs: [{ context: 'Reference context', question: 'User question' }],
        hasUnresolved: false,
      });

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const incompatibleResponse = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: ['promptfoo://provider/00000000-0000-0000-0000-000000000000'],
            redteam: { strategies: ['posterior'] },
          },
        });

      expect(incompatibleResponse.status).toBe(400);
      expect(incompatibleResponse.body.error).toBe(
        'Posterior strategy does not support multi-input targets',
      );
      expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenCalledWith(
        ['promptfoo://provider/00000000-0000-0000-0000-000000000000'],
        undefined,
        undefined,
        undefined,
        { loadDynamicProviders: false },
      );
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it('loads dynamic input metadata before replacing the active job', async () => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );
      mockedResolveRedteamTargetProviderInputMetadata
        .mockResolvedValueOnce({ inputs: [undefined], hasUnresolved: true })
        .mockResolvedValueOnce({
          inputs: [{ context: 'Reference context', question: 'User question' }],
          hasUnresolved: false,
        });

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const replacementResponse = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: ['file:///workspace/dynamic-provider.mjs'],
            redteam: { strategies: ['posterior'] },
          },
        });

      expect(replacementResponse.status).toBe(400);
      expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenNthCalledWith(
        1,
        ['file:///workspace/dynamic-provider.mjs'],
        undefined,
        undefined,
        undefined,
        { loadDynamicProviders: false },
      );
      expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenNthCalledWith(
        2,
        ['file:///workspace/dynamic-provider.mjs'],
        undefined,
        undefined,
        undefined,
        { loadDynamicProviders: true },
      );
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it('rejects known incompatibilities before hydrating unresolved dynamic targets', async () => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );
      mockedResolveRedteamTargetProviderInputMetadata.mockResolvedValueOnce({
        inputs: [{ context: 'Reference context', question: 'User question' }, undefined],
        hasUnresolved: true,
      });

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const replacementResponse = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: [
              { id: 'echo', inputs: { context: 'context', question: 'question' } },
              'file:///workspace/dynamic-provider.mjs',
            ],
            redteam: { strategies: ['posterior'] },
          },
        });

      expect(replacementResponse.status).toBe(400);
      expect(replacementResponse.body.error).toBe(
        'Posterior strategy does not support multi-input targets',
      );
      expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenCalledOnce();
      expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenCalledWith(
        expect.any(Array),
        undefined,
        undefined,
        undefined,
        { loadDynamicProviders: false },
      );
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it.each([
      {
        label: 'target reference',
        config: {
          targets: [{ $ref: '#/definitions/target' }],
          redteam: { strategies: ['posterior'] },
          definitions: {
            target: {
              id: 'echo',
              inputs: { context: 'Reference context', question: 'User question' },
            },
          },
        },
      },
      {
        label: 'redteam reference',
        config: {
          targets: [
            {
              id: 'echo',
              inputs: { context: 'Reference context', question: 'User question' },
            },
          ],
          redteam: { $ref: '#/definitions/redteam' },
          definitions: { redteam: { strategies: ['posterior'] } },
        },
      },
    ])('dereferences a live $label before replacing the active job', async ({ config }) => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        resolveActualTargetProviderInputs,
      );

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const replacementResponse = await request(app).post('/api/redteam/run').send({ config });

      expect(replacementResponse.status).toBe(400);
      expect(replacementResponse.body.error).toBe(
        'Posterior strategy does not support multi-input targets',
      );
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it('should apply target filters before compatibility validation', async () => {
      const targets = [
        { id: 'echo', label: 'selected-single' },
        {
          id: 'echo',
          label: 'excluded-multi',
          inputs: { context: 'Reference context', question: 'User question' },
        },
      ];
      mockedResolveRedteamTargetProviderInputMetadata.mockResolvedValueOnce({
        inputs: [undefined],
        hasUnresolved: false,
      });

      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets,
            redteam: { strategies: ['posterior'] },
            commandLineOptions: { filterTargets: 'selected-single' },
          },
        });

      expect(response.status).toBe(200);
      expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenCalledWith(
        targets,
        undefined,
        undefined,
        'selected-single',
        { loadDynamicProviders: false },
      );
    });

    it('should let the newest overlapping run request win after async preflight', async () => {
      let resolveFirstPreflight:
        | ((value: { inputs: unknown[]; hasUnresolved: boolean }) => void)
        | undefined;
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedResolveRedteamTargetProviderInputMetadata
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirstPreflight = resolve;
            }),
        )
        .mockResolvedValueOnce({ inputs: [], hasUnresolved: false });
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );

      const config = {
        targets: [{ id: 'echo' }],
        redteam: { strategies: ['posterior'] },
      };
      const firstResponsePromise = request(app)
        .post('/api/redteam/run')
        .send({ config: { ...config, purpose: 'older' } })
        .then((response) => response);
      await vi.waitFor(() => {
        expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenCalledTimes(1);
      });

      const newerResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { ...config, purpose: 'newer' } });
      expect(newerResponse.status).toBe(200);

      const statusWhileOlderPreflightIsPending = await request(app).get('/api/redteam/status');
      expect(statusWhileOlderPreflightIsPending.body).toMatchObject({
        hasRunningJob: true,
        hasPendingRun: false,
        latestRunId: newerResponse.body.id,
      });

      resolveFirstPreflight!({ inputs: [], hasUnresolved: false });
      const olderResponse = await firstResponsePromise;
      expect(olderResponse.status).toBe(409);
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
      });
    });

    it('should cancel a run that is still awaiting compatibility preflight', async () => {
      let resolvePreflight:
        | ((value: { inputs: unknown[]; hasUnresolved: boolean }) => void)
        | undefined;
      mockedResolveRedteamTargetProviderInputMetadata.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePreflight = resolve;
          }),
      );

      const runResponsePromise = request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: [{ id: 'echo' }],
            redteam: { strategies: ['posterior'] },
          },
        })
        .then((response) => response);
      await vi.waitFor(() => {
        expect(mockedResolveRedteamTargetProviderInputMetadata).toHaveBeenCalledOnce();
      });

      const pendingStatusResponse = await request(app).get('/api/redteam/status');
      expect(pendingStatusResponse.body).toMatchObject({
        hasRunningJob: false,
        hasPendingRun: true,
        jobId: null,
      });

      const cancelResponse = await request(app).post('/api/redteam/cancel');
      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.message).toBe('Pending run cancelled');

      const cancelledStatusResponse = await request(app).get('/api/redteam/status');
      expect(cancelledStatusResponse.body).toMatchObject({
        hasRunningJob: false,
        hasPendingRun: false,
        jobId: null,
      });

      resolvePreflight!({ inputs: [], hasUnresolved: false });
      const runResponse = await runResponsePromise;
      expect(runResponse.status).toBe(409);
      expect(mockedDoRedteamRun).not.toHaveBeenCalled();

      const finalStatusResponse = await request(app).get('/api/redteam/status');
      expect(finalStatusResponse.body).toMatchObject({
        hasRunningJob: false,
        hasPendingRun: false,
        jobId: null,
      });
    });

    it('should not expose provider resolution details in validation errors', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      mockedResolveRedteamTargetProviderInputMetadata.mockRejectedValueOnce(
        new Error("ENOENT: open '/tmp/private-provider.yaml'"),
      );

      const response = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            targets: ['file:///tmp/private-provider.yaml'],
            redteam: { strategies: ['posterior'] },
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid target provider configuration' });
      expect(JSON.stringify(response.body)).not.toContain('/tmp/private-provider.yaml');
      expect(warnSpy).toHaveBeenCalledWith(
        '[Redteam] Failed to resolve target configuration before starting run',
      );
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('/tmp/private-provider.yaml');
      expect(mockedDoRedteamRun).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should reject user-configured internal per-turn layers before replacing the active job', async () => {
      let resolveRun: ((value: undefined) => void) | undefined;
      mockedDoRedteamRun.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );

      const firstResponse = await request(app)
        .post('/api/redteam/run')
        .send({ config: { purpose: 'first' } });
      expect(firstResponse.status).toBe(200);

      const incompatibleResponse = await request(app)
        .post('/api/redteam/run')
        .send({
          config: {
            redteam: {
              strategies: [
                {
                  id: 'jailbreak:hydra',
                  config: { _perTurnLayers: ['posterior'] },
                },
              ],
            },
          },
        });

      expect(incompatibleResponse.status).toBe(400);
      expect(incompatibleResponse.body.error).toContain('"_perTurnLayers" is reserved');
      expect(mockedDoRedteamRun).toHaveBeenCalledOnce();
      expect(mockedDoRedteamRun.mock.calls[0][0].abortSignal?.aborted).toBe(false);

      resolveRun!(undefined);
      await vi.waitFor(async () => {
        const statusResponse = await request(app).get('/api/redteam/status');
        expect(statusResponse.body).toMatchObject({ hasRunningJob: false, jobId: null });
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
      expect(response.body).toHaveProperty('hasPendingRun');
      expect(response.body).toHaveProperty('jobId');
      expect(response.body.hasRunningJob).toBe(false);
      expect(response.body.hasPendingRun).toBe(false);
      expect(response.body.jobId).toBeNull();
    });
  });
});
