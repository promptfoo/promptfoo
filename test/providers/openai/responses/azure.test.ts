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

    it.each([
      { owner: 'provider', model: 'gpt-4.1' },
      { owner: 'prompt', model: 'gpt-4.1' },
      { owner: 'provider', model: 'ft:gpt-4.1-2025-04-14:org:custom:id' },
      { owner: 'prompt', model: 'ft:gpt-4.1-2025-04-14:org:custom:id' },
    ] as const)(
      'uses the $owner passthrough $model capabilities instead of inherited Azure deployment hints',
      async ({ owner, model }) => {
        const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
          config: {
            apiKey: 'test-key',
            apiBaseUrl: AZURE_BASE_URL,
            reasoning_effort: 'high',
            reasoning: { summary: 'concise' },
            verbosity: 'low',
            temperature: 0.7,
            ...(owner === 'provider' && { passthrough: { model } }),
          },
        });

        const { body } = await provider.getOpenAiBody(
          'Test prompt',
          owner === 'prompt'
            ? {
                vars: {},
                prompt: {
                  raw: 'Test prompt',
                  label: 'override',
                  config: { passthrough: { model } },
                },
              }
            : undefined,
        );

        expect(body.model).toBe(model);
        expect(body).not.toHaveProperty('reasoning');
        expect(body.text).not.toHaveProperty('verbosity');
        expect(body.temperature).toBe(0.7);
        expect(body.max_output_tokens).toBe(1024);
      },
    );

    it.each([
      { owner: 'provider', model: AZURE_MODEL },
      { owner: 'prompt', model: AZURE_MODEL },
      { owner: 'provider', model: 'deployment-b' },
      { owner: 'prompt', model: 'deployment-b' },
    ] as const)(
      'preserves explicit reasoning hints for the $owner opaque deployment override $model',
      async ({ owner, model }) => {
        mockAzureSuccessResponse();
        const passthrough = { model };
        const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
          config: {
            apiKey: 'test-key',
            apiBaseUrl: AZURE_BASE_URL,
            reasoning_effort: 'high',
            reasoning: { summary: 'concise' },
            verbosity: 'low',
            ...(owner === 'provider' ? { passthrough } : {}),
          },
        });
        const context =
          owner === 'prompt'
            ? {
                vars: {},
                prompt: { raw: 'Test prompt', label: 'override', config: { passthrough } },
              }
            : undefined;

        const result = await provider.callApi('Test prompt', context);
        const body = getRequestBody();

        expect(vi.mocked(cache.fetchWithCache).mock.calls[0][0]).toBe(
          `${AZURE_BASE_URL}/responses`,
        );
        expect(body.model).toBe(model);
        expect(body.reasoning).toEqual({ effort: 'high', summary: 'concise' });
        expect(body.text).toHaveProperty('verbosity', 'low');
        expect(body).not.toHaveProperty('temperature');
        expect(body).not.toHaveProperty('max_output_tokens');
        expect(result.output).toBe('Response from Azure custom deployment');
        expect(result.error).toBeUndefined();
      },
    );

    it.each(['provider', 'prompt'] as const)(
      'retains verbosity-only defaults for an opaque %s model override',
      async (owner) => {
        const passthrough = { model: 'deployment-b' };
        const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
          config: {
            apiKey: 'test-key',
            apiBaseUrl: AZURE_BASE_URL,
            verbosity: 'low',
            ...(owner === 'provider' ? { passthrough } : {}),
          },
        });
        const context =
          owner === 'prompt'
            ? {
                vars: {},
                prompt: { raw: 'Test prompt', label: 'override', config: { passthrough } },
              }
            : undefined;

        const { body } = await provider.getOpenAiBody('Test prompt', context);

        expect(body.model).toBe('deployment-b');
        expect(body.text).toHaveProperty('verbosity', 'low');
        expect(body.max_output_tokens).toBe(1024);
        expect(body.temperature).toBe(0);
        expect(body).not.toHaveProperty('reasoning');
      },
    );

    it('preserves temperature when an opaque override explicitly disables reasoning', async () => {
      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          passthrough: { model: 'deployment-b' },
          reasoning_effort: 'none',
          temperature: 0.7,
          max_output_tokens: 2000,
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body).toMatchObject({
        model: 'deployment-b',
        reasoning: { effort: 'none' },
        temperature: 0.7,
        max_output_tokens: 2000,
      });
    });

    it('retains reasoning capabilities for an explicit reasoning model on Azure', async () => {
      const provider = new OpenAiResponsesProvider(AZURE_MODEL, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: AZURE_BASE_URL,
          passthrough: { model: 'gpt-5' },
          reasoning_effort: 'high',
          verbosity: 'low',
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.model).toBe('gpt-5');
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.text).toHaveProperty('verbosity', 'low');
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('max_output_tokens');
    });

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
