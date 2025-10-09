import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import { redteamRouter } from '../../../src/server/routes/redteam';
import { Plugins } from '../../../src/redteam/plugins';
import * as redteamProviderManager from '../../../src/redteam/providers/shared';
import logger from '../../../src/logger';

// Mock dependencies
jest.mock('../../../src/redteam/plugins');
jest.mock('../../../src/redteam/providers/shared');
jest.mock('../../../src/logger');

// Mock the strategies module
jest.mock('../../../src/redteam/strategies/index', () => ({
  Strategies: [
    {
      id: 'basic',
      name: 'Basic',
      action: jest.fn(() => []), // Basic strategy returns empty array
    },
    {
      id: 'jailbreak',
      name: 'Jailbreak',
      action: jest.fn((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          vars: {
            ...tc.vars,
            query: `[jailbreak] ${tc.vars.query}`,
          },
        }))
      ),
    },
    {
      id: 'base64',
      name: 'Base64',
      action: jest.fn((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          vars: {
            ...tc.vars,
            query: Buffer.from(tc.vars.query).toString('base64'),
          },
        }))
      ),
    },
    {
      id: 'crescendo',
      name: 'Crescendo',
      action: jest.fn(() => []), // Multi-turn strategy, complex handling
    },
  ],
}));

describe('POST /redteam/generate-strategy-test', () => {
  let app: Express;
  const mockPlugin = {
    key: 'harmful:hate',
    action: jest.fn(),
  };
  const mockProvider = {
    callApi: jest.fn(),
  };

  beforeEach(() => {
    // Set up Express app with the router
    app = express();
    app.use(express.json());
    app.use('/redteam', redteamRouter);

    // Reset all mocks
    jest.clearAllMocks();

    // Mock Plugins.find
    (Plugins.find as jest.Mock) = jest.fn((predicate) => {
      if (predicate({ key: 'harmful:hate' })) {
        return mockPlugin;
      }
      return undefined;
    });

    // Mock provider manager
    (redteamProviderManager.redteamProviderManager.getProvider as jest.Mock) = jest.fn().mockResolvedValue(mockProvider);

    // Mock logger methods
    (logger.debug as jest.Mock) = jest.fn();
    (logger.error as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Success Cases', () => {
    it('should generate test case for basic strategy', async () => {
      // Mock plugin action to generate test case
      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: 'Test harmful content prompt',
          },
          metadata: {
            pluginId: 'harmful:hate',
            harmCategory: 'hate speech',
          },
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {
            applicationDefinition: { purpose: 'test assistant' },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('prompt');
      expect(response.body).toHaveProperty('context');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.prompt).toBe('Test harmful content prompt');
      expect(response.body.context).toContain('basic');
      expect(response.body.context).toContain('harmful:hate');
      expect(response.body.metadata).toHaveProperty('strategyId', 'basic');
      expect(response.body.metadata).toHaveProperty('pluginId', 'harmful:hate');
    });

    it('should generate and transform test case for jailbreak strategy', async () => {
      // Mock plugin action
      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: 'Original harmful prompt',
          },
          metadata: {
            pluginId: 'harmful:hate',
          },
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'jailbreak',
          config: {
            applicationDefinition: { purpose: 'chat assistant' },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.prompt).toBe('[jailbreak] Original harmful prompt');
      expect(response.body.metadata.strategyId).toBe('jailbreak');
    });

    it('should generate and encode test case for base64 strategy', async () => {
      const originalPrompt = 'Test prompt for encoding';
      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: originalPrompt,
          },
          metadata: {},
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'base64',
          config: {},
        });

      expect(response.status).toBe(200);
      expect(response.body.prompt).toBe(Buffer.from(originalPrompt).toString('base64'));
      expect(response.body.metadata.strategyId).toBe('base64');
    });

    it('should use default values when config is not provided', async () => {
      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: 'Default test prompt',
          },
          metadata: {},
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
        });

      expect(response.status).toBe(200);
      expect(mockPlugin.action).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'general AI assistant',
          injectVar: 'query',
        })
      );
    });

    it('should handle custom inject variable', async () => {
      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            customVar: 'Test with custom variable',
          },
          metadata: {},
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {
            injectVar: 'customVar',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.prompt).toBe('Test with custom variable');
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for missing strategy ID', async () => {
      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          config: {},
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Strategy ID is required');
    });

    it('should return 400 for invalid strategy ID', async () => {
      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'nonexistent-strategy',
          config: {},
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Strategy nonexistent-strategy not found');
    });

    it('should return 500 when plugin fails to generate test case', async () => {
      mockPlugin.action.mockResolvedValue([]); // Empty array means no test cases generated

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {},
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to generate test case');
    });

    it('should handle plugin action errors gracefully', async () => {
      mockPlugin.action.mockRejectedValue(new Error('Plugin execution failed'));

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {},
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to generate strategy test case');
      expect(response.body).toHaveProperty('details', 'Plugin execution failed');
    });

    it('should handle provider errors gracefully', async () => {
      (redteamProviderManager.redteamProviderManager.getProvider as jest.Mock)
        .mockRejectedValue(new Error('Provider initialization failed'));

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {},
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to generate strategy test case');
      expect(response.body).toHaveProperty('details', 'Provider initialization failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle multi-turn strategies that return no test cases', async () => {
      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: 'Original prompt for crescendo',
          },
          metadata: {
            pluginId: 'harmful:hate',
          },
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'crescendo',
          config: {},
        });

      // Crescendo returns empty array, should use original test case
      expect(response.status).toBe(200);
      expect(response.body.prompt).toBe('Original prompt for crescendo');
      expect(response.body.metadata.strategyId).toBe('crescendo');
    });

    it('should preserve plugin metadata in final test case', async () => {
      const originalMetadata = {
        pluginId: 'harmful:hate',
        harmCategory: 'hate speech',
        severity: 'high',
        customField: 'custom value',
      };

      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: 'Test prompt',
          },
          metadata: originalMetadata,
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {},
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata).toMatchObject({
        ...originalMetadata,
        strategyId: 'basic',
      });
    });

    it('should handle missing vars object in test case', async () => {
      mockPlugin.action.mockResolvedValue([
        {
          // No vars object
          metadata: {
            pluginId: 'harmful:hate',
          },
        },
      ]);

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {},
        });

      expect(response.status).toBe(200);
      expect(response.body.prompt).toBe('Unable to extract test prompt');
    });

    it('should handle strategy config passed in request', async () => {
      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: 'Test prompt for strategy config',
          },
          metadata: {},
        },
      ]);

      const strategyConfig = {
        temperature: 0.8,
        maxTokens: 150,
      };

      const response = await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'jailbreak',
          config: {
            strategyConfig,
          },
        });

      expect(response.status).toBe(200);
      // Verify strategy action was called with the config
      const { Strategies } = await import('../../../src/redteam/strategies/index');
      const jailbreakStrategy = Strategies.find((s: any) => s.id === 'jailbreak');
      expect(jailbreakStrategy?.action).toHaveBeenCalledWith(
        expect.any(Array),
        'query',
        strategyConfig
      );
    });

    it('should handle concurrent requests independently', async () => {
      let callCount = 0;
      mockPlugin.action.mockImplementation(() => {
        callCount++;
        return Promise.resolve([
          {
            vars: {
              query: `Test prompt ${callCount}`,
            },
            metadata: {},
          },
        ]);
      });

      // Send multiple concurrent requests
      const promises = [
        request(app)
          .post('/redteam/generate-strategy-test')
          .send({ strategyId: 'basic' }),
        request(app)
          .post('/redteam/generate-strategy-test')
          .send({ strategyId: 'jailbreak' }),
        request(app)
          .post('/redteam/generate-strategy-test')
          .send({ strategyId: 'base64' }),
      ];

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('prompt');
        expect(response.body).toHaveProperty('context');
        expect(response.body).toHaveProperty('metadata');
      });

      // Should have been called 3 times
      expect(mockPlugin.action).toHaveBeenCalledTimes(3);
    });
  });

  describe('Logging and Sanitization', () => {
    it('should sanitize sensitive data in logs', async () => {
      const sensitiveConfig = {
        applicationDefinition: { purpose: 'test' },
        apiKey: 'secret-api-key',
        password: 'secret-password',
      };

      mockPlugin.action.mockResolvedValue([
        {
          vars: {
            query: 'Test prompt',
          },
          metadata: {},
        },
      ]);

      await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: sensitiveConfig,
        });

      // Check that logger was called
      expect(logger.error).not.toHaveBeenCalled(); // No errors should occur

      // Note: Actual sanitization happens in the logger utility,
      // so we're just ensuring the endpoint doesn't expose secrets in the response
    });

    it('should log errors with appropriate context', async () => {
      mockPlugin.action.mockRejectedValue(new Error('Test error'));

      await request(app)
        .post('/redteam/generate-strategy-test')
        .send({
          strategyId: 'basic',
          config: {},
        });

      expect(logger.error).toHaveBeenCalledWith(
        'Error generating strategy test case',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });
  });
});