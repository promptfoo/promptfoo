// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { setOpenAiEnv } from './setup';

describe('OpenAiResponsesProvider Azure custom deployments', () => {
  describe('Azure custom deployment detection', () => {
    const AZURE_BASE_URL = 'https://my-resource.openai.azure.com/openai/v1';
    const AZURE_MODEL = 'my-company-gpt-54-prod';

    function mockAzureSuccessResponse(): void {
      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        data: {
          id: 'resp_abc123',
          status: 'completed',
          model: AZURE_MODEL,
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Response from Azure custom deployment' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    }

    function getRequestBody(): Record<string, any> {
      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      return JSON.parse(reqOptions.body);
    }

    it('should include explicit reasoning and verbosity for Azure custom deployment names', async () => {
      mockAzureSuccessResponse();

      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          reasoning: { effort: 'medium' },
          temperature: 0.7,
          verbosity: 'low',
        },
      });

      await provider.callApi('Test prompt');
      const body = getRequestBody();

      expect(body.model).toBe(AZURE_MODEL);
      expect(body.reasoning).toEqual({ effort: 'medium' });
      expect(body.text).toMatchObject({ format: { type: 'text' }, verbosity: 'low' });
      expect(body.temperature).toBeUndefined();
    });

    it('should include reasoning_effort for Azure custom deployment names without verbosity', async () => {
      mockAzureSuccessResponse();

      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          reasoning_effort: 'medium',
          temperature: 0.7,
        },
      });

      await provider.callApi('Test prompt');
      const body = getRequestBody();

      expect(body.model).toBe(AZURE_MODEL);
      expect(body.reasoning).toEqual({ effort: 'medium' });
      expect(body.text).toEqual({ format: { type: 'text' } });
      expect(body.temperature).toBeUndefined();
    });

    it('should include verbosity for Azure custom deployment names without reasoning', async () => {
      mockAzureSuccessResponse();

      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          temperature: 0.7,
          verbosity: 'low',
        },
      });

      await provider.callApi('Test prompt');
      const body = getRequestBody();

      expect(body.model).toBe(AZURE_MODEL);
      expect(body.reasoning).toBeUndefined();
      expect(body.text).toMatchObject({ format: { type: 'text' }, verbosity: 'low' });
      expect(body.temperature).toBe(0.7);
    });

    it('should preserve temperature when reasoning_effort is none', async () => {
      mockAzureSuccessResponse();

      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          reasoning_effort: 'none',
          temperature: 0.7,
        },
      });

      await provider.callApi('Test prompt');
      const body = getRequestBody();

      expect(body.reasoning).toEqual({ effort: 'none' });
      expect(body.temperature).toBe(0.7);
    });

    it('should detect Azure deployment via apiHost', async () => {
      mockAzureSuccessResponse();

      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiHost: 'my-resource.openai.azure.com',
          reasoning_effort: 'medium',
          temperature: 0.7,
        },
      });

      await provider.callApi('Test prompt');
      const body = getRequestBody();

      expect(body.reasoning).toEqual({ effort: 'medium' });
      expect(body.temperature).toBeUndefined();
    });

    it('should detect Azure deployment via OpenAI endpoint environment variables', async () => {
      setOpenAiEnv({ OPENAI_API_BASE_URL: AZURE_BASE_URL });

      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          reasoning_effort: 'medium',
          temperature: 0.7,
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.reasoning).toEqual({ effort: 'medium' });
      expect(body.temperature).toBeUndefined();
    });

    it('should detect Azure deployment via provider env overrides', async () => {
      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          reasoning_effort: 'medium',
          temperature: 0.7,
        },
        env: {
          OPENAI_API_HOST: 'my-resource.openai.azure.com',
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.reasoning).toEqual({ effort: 'medium' });
      expect(body.temperature).toBeUndefined();
    });

    it('should not trigger Azure reasoning detection for non-Azure hosts', async () => {
      const provider = new OpenAiResponsesProvider('custom-model', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://api.example.com/v1',
          reasoning_effort: 'medium',
          temperature: 0.5,
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.reasoning).toBeUndefined();
      expect(body.temperature).toBe(0.5);
    });

    it('should not trigger Azure reasoning detection when openai.azure.com appears outside the host', async () => {
      const provider = new OpenAiResponsesProvider('custom-model', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://api.example.com/proxy/openai.azure.com/v1',
          reasoning_effort: 'medium',
          temperature: 0.5,
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.reasoning).toBeUndefined();
      expect(body.temperature).toBe(0.5);
    });

    it('should merge reasoning object with reasoning_effort', async () => {
      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          reasoning_effort: 'high',
          reasoning: { summary: 'concise' },
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.reasoning).toEqual({ effort: 'high', summary: 'concise' });
    });

    it('should use correct max_output_tokens default for verbosity-only deployments', async () => {
      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          verbosity: 'low',
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.max_output_tokens).toBe(1024);
      expect(body.text).toMatchObject({ verbosity: 'low' });
    });
  });
});
