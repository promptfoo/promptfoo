/**
 * Contract tests for redteam API routes.
 *
 * These tests verify the request validation and response shape contracts
 * defined in the DTO schemas. They mock the underlying services to focus
 * on the API contract, not the business logic.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';
import {
  GenerateTestResponseSchema,
  GenerateTestBatchResponseSchema,
  GenerateTestSingleResponseSchema,
} from '../../../src/dtos/redteam.dto';

// Mock dependencies to isolate contract testing
vi.mock('../../../src/redteam/plugins/index');
vi.mock('../../../src/redteam/strategies/index');
vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/server/services/redteamTestCaseGenerationService');

// Import mocks after mocking
import { Plugins } from '../../../src/redteam/plugins/index';
import { Strategies } from '../../../src/redteam/strategies/index';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import {
  extractGeneratedPrompt,
  getPluginConfigurationError,
} from '../../../src/server/services/redteamTestCaseGenerationService';

const mockedPlugins = vi.mocked(Plugins);
const mockedStrategies = vi.mocked(Strategies);
const mockedRedteamProviderManager = vi.mocked(redteamProviderManager);
const mockedExtractGeneratedPrompt = vi.mocked(extractGeneratedPrompt);
const mockedGetPluginConfigurationError = vi.mocked(getPluginConfigurationError);

describe('Redteam Routes - Generate Test Endpoint', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();

    // Setup default mock implementations
    mockedGetPluginConfigurationError.mockReturnValue(null);
    mockedExtractGeneratedPrompt.mockReturnValue('Generated test prompt');

    // Mock provider manager
    mockedRedteamProviderManager.getProvider.mockResolvedValue({
      id: () => 'mock-provider',
      callApi: vi.fn(),
    } as any);

    // Mock plugin factory with basic action
    const mockPluginFactory = {
      key: 'harmful:hate',
      action: vi.fn().mockResolvedValue([
        {
          vars: { query: 'Generated test prompt' },
          metadata: { pluginId: 'harmful:hate', harmCategory: 'hate' },
        },
      ]),
    };
    (mockedPlugins as any).find = vi.fn(() => mockPluginFactory);

    // Mock strategy factory
    const mockStrategyFactory = {
      id: 'basic',
      action: vi.fn().mockImplementation((testCases) => testCases),
    };
    (mockedStrategies as any).find = vi.fn(() => mockStrategyFactory);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Request Validation', () => {
    it('should reject request missing required fields', async () => {
      const response = await request(app).post('/api/redteam/generate-test').send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid request body');
    });

    it('should reject request with missing plugin', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'Test' } },
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with missing strategy', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          config: { applicationDefinition: { purpose: 'Test' } },
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with invalid plugin ID', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'invalid-plugin-id' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'Test' } },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
      expect(response.body.details).toContain('Invalid plugin ID');
    });

    it('should reject request with invalid strategy ID', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'invalid-strategy-id' },
          config: { applicationDefinition: { purpose: 'Test' } },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
      expect(response.body.details).toContain('Invalid strategy ID');
    });

    it('should reject count exceeding maximum', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'Test' } },
          count: 15, // Max is 10
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept valid minimal request', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: null } },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('kind');
    });
  });

  describe('Response Format - Single Test Case', () => {
    it('should return single response with kind discriminator', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'AI assistant' } },
        });

      expect(response.status).toBe(200);

      // Verify the response validates against the schema
      const parseResult = GenerateTestSingleResponseSchema.safeParse(response.body);
      expect(parseResult.success).toBe(true);

      // Verify discriminator
      expect(response.body.kind).toBe('single');
      expect(response.body).toHaveProperty('prompt');
      expect(response.body).toHaveProperty('context');
    });

    it('should return single response that validates against discriminated union', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'AI assistant' } },
          count: 1,
        });

      expect(response.status).toBe(200);

      // The discriminated union should correctly narrow based on kind
      const parseResult = GenerateTestResponseSchema.safeParse(response.body);
      expect(parseResult.success).toBe(true);

      if (parseResult.success && parseResult.data.kind === 'single') {
        expect(parseResult.data.prompt).toBeDefined();
        expect(parseResult.data.context).toBeDefined();
      }
    });
  });

  describe('Response Format - Batch Test Cases', () => {
    beforeEach(() => {
      // Setup plugin to return multiple test cases for batch testing
      const mockPluginFactory = {
        key: 'harmful:hate',
        action: vi.fn().mockResolvedValue([
          {
            vars: { query: 'Test prompt 1' },
            metadata: { pluginId: 'harmful:hate' },
          },
          {
            vars: { query: 'Test prompt 2' },
            metadata: { pluginId: 'harmful:hate' },
          },
          {
            vars: { query: 'Test prompt 3' },
            metadata: { pluginId: 'harmful:hate' },
          },
        ]),
      };
      (mockedPlugins as any).find = vi.fn(() => mockPluginFactory);

      // Return different prompts for each call
      mockedExtractGeneratedPrompt
        .mockReturnValueOnce('Test prompt 1')
        .mockReturnValueOnce('Test prompt 2')
        .mockReturnValueOnce('Test prompt 3');
    });

    it('should return batch response with kind discriminator when count > 1', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'AI assistant' } },
          count: 3,
        });

      expect(response.status).toBe(200);

      // Verify the response validates against the batch schema
      const parseResult = GenerateTestBatchResponseSchema.safeParse(response.body);
      expect(parseResult.success).toBe(true);

      // Verify discriminator and structure
      expect(response.body.kind).toBe('batch');
      expect(response.body).toHaveProperty('testCases');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.testCases)).toBe(true);
    });

    it('should return batch response that validates against discriminated union', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'AI assistant' } },
          count: 3,
        });

      expect(response.status).toBe(200);

      // The discriminated union should correctly narrow based on kind
      const parseResult = GenerateTestResponseSchema.safeParse(response.body);
      expect(parseResult.success).toBe(true);

      if (parseResult.success && parseResult.data.kind === 'batch') {
        expect(parseResult.data.testCases).toBeDefined();
        expect(parseResult.data.count).toBeDefined();
        expect(parseResult.data.testCases.length).toBe(parseResult.data.count);
      }
    });

    it('should include proper structure in batch testCases', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'AI assistant' } },
          count: 3,
        });

      expect(response.status).toBe(200);
      expect(response.body.kind).toBe('batch');

      // Each test case should have the required fields
      for (const testCase of response.body.testCases) {
        expect(testCase).toHaveProperty('prompt');
        expect(testCase).toHaveProperty('context');
      }
    });
  });

  describe('Plugin Configuration Validation', () => {
    it('should return 400 when plugin configuration has errors', async () => {
      mockedGetPluginConfigurationError.mockReturnValue('Plugin requires a custom policy');

      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate', config: {} },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'Test' } },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Plugin requires a custom policy');
    });
  });

  describe('Type-safe Response Narrowing', () => {
    it('should enable TypeScript-style narrowing on response', async () => {
      const response = await request(app)
        .post('/api/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate' },
          strategy: { id: 'basic' },
          config: { applicationDefinition: { purpose: 'Test' } },
        });

      expect(response.status).toBe(200);

      const parsed = GenerateTestResponseSchema.parse(response.body);

      // This is the pattern clients should use
      if (parsed.kind === 'single') {
        // TypeScript knows prompt exists
        expect(typeof parsed.prompt).toBe('string');
        expect(typeof parsed.context).toBe('string');
      } else {
        // TypeScript knows testCases exists
        expect(Array.isArray(parsed.testCases)).toBe(true);
        expect(typeof parsed.count).toBe('number');
      }
    });
  });
});
