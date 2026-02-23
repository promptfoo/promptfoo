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
import { Plugins } from '../../../src/redteam/plugins/index';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import { doRedteamRun } from '../../../src/redteam/shared';
import {
  extractGeneratedPrompt,
  getPluginConfigurationError,
} from '../../../src/server/services/redteamTestCaseGenerationService';
import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedPlugins = vi.mocked(Plugins);
const mockedRedteamProviderManager = vi.mocked(redteamProviderManager);
const mockedGetPluginConfigurationError = vi.mocked(getPluginConfigurationError);
const mockedExtractGeneratedPrompt = vi.mocked(extractGeneratedPrompt);
const mockedDoRedteamRun = vi.mocked(doRedteamRun);
const mockedGetRemoteGenerationUrl = vi.mocked(getRemoteGenerationUrl);
const mockedFetchWithProxy = vi.mocked(fetchWithProxy);

describe('Redteam Routes', () => {
  describe('POST /redteam/generate-test', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();

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
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
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
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
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
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.clearAllMocks();
      app = createApp();
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
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.clearAllMocks();
      app = createApp();
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
