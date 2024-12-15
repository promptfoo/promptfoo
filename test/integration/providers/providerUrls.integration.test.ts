import { jest, expect, describe, beforeEach, afterEach, it } from '@jest/globals';
import nock from 'nock';
import type { GoogleAuth } from 'google-auth-library';
import { CloudConfig } from '../../../src/globalConfig/cloud';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai';
import { PromptfooHarmfulCompletionProvider } from '../../../src/providers/promptfoo';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic';
import { VertexChatProvider } from '../../../src/providers/vertex';
import type { GeminiApiResponse } from '../../../src/providers/vertexUtil';
import { VERSION } from '../../../src/constants';
import * as accounts from '../../../src/globalConfig/accounts';

const TEST_TIMEOUT = 60000;
const TEST_EMAIL = 'test@example.com';
const TEST_PROMPT = 'test prompt';

// Mock accounts
jest.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn().mockReturnValue(TEST_EMAIL),
}));

// Mock CloudConfig
const mockCloudConfigInstance = {
  isEnabled: jest.fn(),
  getApiHost: jest.fn(),
};

jest.mock('../../../src/globalConfig/cloud', () => ({
  CloudConfig: {
    getInstance: jest.fn().mockReturnValue(mockCloudConfigInstance),
  },
}));

describe('Provider URL Configuration', () => {
  const originalEnv = process.env;
  let pendingMocks: nock.Scope[] = [];

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PROMPTFOO_REDTEAM_INFERENCE_ENDPOINT;
    delete process.env.PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT;
    delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;

    if (!nock.isActive()) {
      nock.activate();
    }
    nock.cleanAll();
    jest.clearAllMocks();
    pendingMocks = [];

    // Reset CloudConfig mock
    mockCloudConfigInstance.isEnabled.mockReset();
    mockCloudConfigInstance.getApiHost.mockReset();
    mockCloudConfigInstance.isEnabled.mockReturnValue(false);
  });

  afterEach(async () => {
    process.env = originalEnv;

    // Clean up any pending mocks
    pendingMocks.forEach(scope => {
      try {
        scope.done();
      } catch (error) {
        console.error('Pending nock interceptors:', scope.pendingMocks());
        throw error;
      }
    });

    nock.cleanAll();
    if (nock.isDone()) {
      nock.restore();
    }
    jest.clearAllMocks();
  });

  describe('Unaligned Provider', () => {
    const mockUnalignedOptions = {
      harmCategory: 'test-category',
      n: 1,
      purpose: 'testing',
    };

    const expectedRequestBody = {
      ...mockUnalignedOptions,
      email: TEST_EMAIL,
      version: VERSION,
    };

    it('should use URL from environment variable', async () => {
      const envUrl = 'https://env.api.test/unaligned';
      process.env.PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT = envUrl;

      const scope = nock(envUrl)
        .post('/', body => {
          expect(body).toMatchObject(expectedRequestBody);
          return true;
        })
        .reply(200, {
          output: ['test response'],
        });
      pendingMocks.push(scope);

      const provider = new PromptfooHarmfulCompletionProvider(mockUnalignedOptions);

      const result = await provider.callApi(TEST_PROMPT);
      expect(result.error).toBeUndefined();
      expect(result.output).toEqual(['test response']);
      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);

    it('should handle API errors gracefully', async () => {
      const envUrl = 'https://env.api.test/unaligned';
      process.env.PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT = envUrl;

      const scope = nock(envUrl)
        .post('/', body => {
          expect(body).toMatchObject(expectedRequestBody);
          return true;
        })
        .reply(400, {
          error: {
            name: 'ValidationError',
            message: 'Invalid request',
          },
        });
      pendingMocks.push(scope);

      const provider = new PromptfooHarmfulCompletionProvider(mockUnalignedOptions);

      const result = await provider.callApi(TEST_PROMPT);
      expect(result.error).toBeDefined();
      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);

    it('should use cloud config URL when available', async () => {
      const cloudUrl = 'https://cloud.api.test';
      mockCloudConfigInstance.isEnabled.mockReturnValue(true);
      mockCloudConfigInstance.getApiHost.mockReturnValue(cloudUrl);

      const scope = nock(cloudUrl)
        .post('/task/harmful', body => {
          expect(body).toMatchObject(expectedRequestBody);
          return true;
        })
        .reply(200, {
          output: ['test response'],
        });
      pendingMocks.push(scope);

      const provider = new PromptfooHarmfulCompletionProvider(mockUnalignedOptions);
      const result = await provider.callApi(TEST_PROMPT);

      expect(result.error).toBeUndefined();
      expect(result.output).toEqual(['test response']);
      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);

    it('should use default URL when no config is present', async () => {
      delete process.env.PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT;
      mockCloudConfigInstance.isEnabled.mockReturnValue(false);

      const scope = nock('https://api.promptfoo.app')
        .post('/task/harmful', body => {
          expect(body).toMatchObject(expectedRequestBody);
          return true;
        })
        .reply(200, {
          output: ['test response'],
        });
      pendingMocks.push(scope);

      const provider = new PromptfooHarmfulCompletionProvider(mockUnalignedOptions);
      const result = await provider.callApi(TEST_PROMPT);

      expect(result.error).toBeUndefined();
      expect(result.output).toEqual(['test response']);
      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Redteam Provider', () => {
    const mockRedteamOptions = {
      id: 'test-redteam',
      apiKey: 'test-key',
      model: 'test-model',
      injectVar: 'test-inject',
    };

    const mockOriginalProvider = new OpenAiChatCompletionProvider('gpt-4', {
      config: { apiKey: 'test-key' },
    });

    beforeEach(() => {
      // Mock OpenAI responses for the iterative process
      // 1. Original response
      nock('https://api.openai.com')
        .post('/v1/chat/completions', body => {
          expect(body).toHaveProperty('model', 'gpt-4');
          expect(body).toHaveProperty('messages');
          return true;
        })
        .times(4) // Original response + on-topic check + judge + potential retry
        .reply(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  onTopic: true,
                  rating: 5,
                  improvement: 'test improvement',
                }),
              },
            },
          ],
        });
    });
    it('should use URL from environment variable', async () => {
      const envUrl = 'https://env.api.test/redteam';
      process.env.PROMPTFOO_REDTEAM_INFERENCE_ENDPOINT = envUrl;

      const scope = nock(envUrl)
        .post('/', body => {
          // Verify the request body contains the expected fields
          expect(body).toHaveProperty('email', TEST_EMAIL);
          expect(body).toHaveProperty('version', VERSION);
          expect(body).toHaveProperty('prompt', TEST_PROMPT);
          expect(body).toHaveProperty('goal', 'test goal');
          return true;
        })
        .reply(200, {
          output: JSON.stringify({
            improvement: 'test improvement',
            prompt: TEST_PROMPT,
          }),
        });
      pendingMocks.push(scope);

      const provider = new RedteamIterativeProvider(mockRedteamOptions);

      await provider.callApi(TEST_PROMPT, {
        originalProvider: mockOriginalProvider,
        vars: { 'test-inject': 'test goal' },
        prompt: { raw: TEST_PROMPT, label: 'test' },
      });

      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);

    it('should use cloud config URL when available', async () => {
      const cloudUrl = 'https://cloud.api.test';
      mockCloudConfigInstance.isEnabled.mockReturnValue(true);
      mockCloudConfigInstance.getApiHost.mockReturnValue(cloudUrl);

      const scope = nock(cloudUrl)
        .post('/api/v1/redteam/generate', body => {
          // Verify the request body contains the expected fields
          expect(body).toHaveProperty('email', TEST_EMAIL);
          expect(body).toHaveProperty('version', VERSION);
          expect(body).toHaveProperty('prompt', TEST_PROMPT);
          expect(body).toHaveProperty('goal', 'test goal');
          return true;
        })
        .reply(200, {
          output: JSON.stringify({
            improvement: 'test improvement',
            prompt: TEST_PROMPT,
          }),
        });
      pendingMocks.push(scope);

      const provider = new RedteamIterativeProvider(mockRedteamOptions);

      await provider.callApi(TEST_PROMPT, {
        originalProvider: mockOriginalProvider,
        vars: { 'test-inject': 'test goal' },
        prompt: { raw: TEST_PROMPT, label: 'test' },
      });

      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);

    it('should handle API errors gracefully', async () => {
      const envUrl = 'https://env.api.test/redteam';
      process.env.PROMPTFOO_REDTEAM_INFERENCE_ENDPOINT = envUrl;

      const scope = nock(envUrl)
        .post('/', body => {
          expect(body).toHaveProperty('email', TEST_EMAIL);
          expect(body).toHaveProperty('version', VERSION);
          return true;
        })
        .reply(400, {
          error: {
            name: 'ValidationError',
            message: 'Invalid request',
          },
        });
      pendingMocks.push(scope);

      const provider = new RedteamIterativeProvider(mockRedteamOptions);

      await expect(
        provider.callApi(TEST_PROMPT, {
          originalProvider: mockOriginalProvider,
          vars: { 'test-inject': 'test goal' },
          prompt: { raw: TEST_PROMPT, label: 'test' },
        })
      ).rejects.toThrow('Invalid request');

      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Grading Provider', () => {
    it('should use OpenAI grading provider with correct URL', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = new OpenAiChatCompletionProvider('gpt-4', {
        config: {
          apiKey: 'test-key',
          temperature: 0.7,
          max_tokens: 1000,
        },
      });
      const scope = nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, {
          choices: [{ message: { content: 'test response' } }],
        });
      pendingMocks.push(scope);

      await provider.callApi(TEST_PROMPT);

      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);

    it('should use Anthropic grading provider with correct URL', async () => {
      const provider = new AnthropicMessagesProvider('claude-2.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const scope = nock('https://api.anthropic.com')
        .post('/v1/messages')
        .reply(200, {
          content: [{ text: 'test response' }],
          model: 'claude-2.1',
          role: 'assistant',
          type: 'text',
        });
      pendingMocks.push(scope);

      await provider.callApi(TEST_PROMPT);

      expect(scope.isDone()).toBe(true);
    }, TEST_TIMEOUT);
  });
});
