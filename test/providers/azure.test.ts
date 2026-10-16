import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { AzureCompletionProvider } from '../../src/providers/azure/completion';
import { AzureGenericProvider } from '../../src/providers/azure/generic';
import {
  createAzureApiOptions,
  createChatUsage,
  createRequiredTestSchema,
} from '../factories/literalFixtures';
import { mockProcessEnv } from '../util/utils';
import { registerAzureBaseUrlTests } from './azure/baseUrlTests';
import { registerAzureConfigTests } from './azure/configTests';
import { createAzureReasoningChecks, createAzureResponseChecks } from './azure/sharedChecks';
import { registerAzureWarningTests } from './azure/warningTests';
import { createMockFetchResponse } from './mockProviderResponses';

vi.mock('../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

describe('Azure Provider Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AzureGenericProvider.prototype as any, 'getAuthHeaders').mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('maybeEmitAzureOpenAiWarning', () => {
    registerAzureWarningTests();
  });

  describe('AzureOpenAiGenericProvider', () => {
    describe('getApiBaseUrl', () => {
      let restoreEnv: () => void;

      beforeEach(() => {
        restoreEnv = mockProcessEnv({ AZURE_OPENAI_API_HOST: undefined });
      });

      afterEach(() => {
        restoreEnv();
      });

      registerAzureBaseUrlTests();
    });
  });

  describe('AzureOpenAiChatCompletionProvider', () => {
    describe('config merging', () => {
      let provider: AzureChatCompletionProvider;

      beforeEach(() => {
        provider = new AzureChatCompletionProvider('test-deployment', {
          config: {
            apiHost: 'test.azure.com',
            apiKey: 'test-key',
            functions: [{ name: 'provider_func', parameters: {} }],
            max_tokens: 100,
            temperature: 0.5,
          },
        });
      });

      registerAzureConfigTests(() => provider);
    });

    describe('response handling', () => {
      let provider: AzureChatCompletionProvider;

      beforeEach(() => {
        provider = new AzureChatCompletionProvider('test-deployment', createAzureApiOptions());
      });

      afterEach(() => {
        vi.resetAllMocks();
      });

      it('should parse JSON response with json_schema format when finish_reason is not content_filter', async () => {
        const mockResponse = {
          id: 'mock-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({ test: 'value' }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: createChatUsage(),
        };

        provider.config.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'test_response',
            strict: true,
            schema: createRequiredTestSchema(),
          },
        };

        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

        const result = await provider.callApi('test prompt');
        expect(result.output).toEqual({ test: 'value' });
      });

      it('should handle API errors', async () => {
        vi.mocked(fetchWithCache).mockRejectedValueOnce(new Error('API Error'));

        const result = await provider.callApi('test prompt');
        expect(result.error).toBe('API call error: API Error');
      });

      it('should handle invalid JSON response', async () => {
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('invalid json'));

        const result = await provider.callApi('test prompt');
        expect(result.error).toContain('API returned invalid JSON response');
      });

      it('should handle tool calls in response', async () => {
        const mockResponse = {
          id: 'mock-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                tool_calls: [
                  {
                    type: 'function',
                    function: {
                      name: 'test',
                      arguments: '{}',
                    },
                  },
                ],
              },
              finish_reason: 'stop',
            },
          ],
          usage: createChatUsage(),
        };

        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

        const result = await provider.callApi('test prompt');
        expect(result.output).toEqual([
          {
            type: 'function',
            function: {
              name: 'test',
              arguments: '{}',
            },
          },
        ]);
      });

      it('should handle content filter error response', async () => {
        const mockResponse = {
          error: {
            message:
              "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.",
            code: 'content_filter',
            status: 400,
            innererror: {
              code: 'ResponsibleAIPolicyViolation',
              content_filter_result: {
                hate: { filtered: true, severity: 'medium' },
                jailbreak: { filtered: false, detected: false },
                self_harm: { filtered: false, severity: 'safe' },
                sexual: { filtered: false, severity: 'safe' },
                violence: { filtered: false, severity: 'low' },
              },
            },
          },
        };

        vi.mocked(fetchWithCache).mockResolvedValueOnce(
          createMockFetchResponse(mockResponse, { status: 400, statusText: 'Bad Request' }),
        );

        const result = await provider.callApi('test prompt');
        expect(result.output).toBe(mockResponse.error.message);
        expect(result.guardrails).toEqual({
          flagged: true,
          flaggedInput: true,
          flaggedOutput: false,
        });
      });
    });

    describe('structured outputs', () => {
      const sharedResponseChecks = createAzureResponseChecks(() => provider);

      let provider: AzureChatCompletionProvider;

      beforeEach(() => {
        vi.clearAllMocks();
        provider = new AzureChatCompletionProvider('test-deployment', createAzureApiOptions());
      });

      afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
      });

      it(
        'should parse JSON response when prompt config specifies json_object format',
        sharedResponseChecks.parsesPromptJson,
      );

      it(
        'should handle invalid JSON when response format is specified',
        sharedResponseChecks.preservesInvalidPromptJson,
      );

      it('should use correct API URL based on datasources config from prompt', async () => {
        const mockResponse = {
          id: 'mock-id',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'test response',
              },
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

        await provider.callApi('test prompt', {
          prompt: {
            config: {
              dataSources: [{ type: 'test' }],
              apiVersion: '2024-custom',
            },
            label: 'test prompt',
            raw: 'test prompt',
          },
          vars: {},
        });

        // Verify the URL includes extensions and uses the custom API version
        expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toContain(
          '/extensions/chat/completions?api-version=2024-custom',
        );
      });
    });

    describe('Grok deployments', () => {
      // Verified live 2026-09-01 against an Azure AI Foundry grok-4.6 GlobalStandard
      // deployment: presence_penalty, frequency_penalty and stop return HTTP 400, while
      // max_tokens, temperature and reasoning_effort: low are accepted.
      it('strips the sampling parameters Grok 4+ rejects', async () => {
        const provider = new AzureChatCompletionProvider('qa-grok-46', {
          config: { apiHost: 'test.openai.azure.com', stop: ['\n\n'] },
        });

        const { body } = await (provider as any).getOpenAiBody('hello');

        expect(body.presence_penalty).toBeUndefined();
        expect(body.frequency_penalty).toBeUndefined();
        expect(body.stop).toBeUndefined();
        // Grok keeps the non-reasoning request shape: max_tokens and temperature stay.
        expect(body.max_tokens).toBeDefined();
        expect(body.temperature).toBeDefined();
      });

      it('strips them even when the user sets them explicitly', async () => {
        const provider = new AzureChatCompletionProvider('grok-4.3-prod', {
          config: {
            apiHost: 'test.openai.azure.com',
            presence_penalty: 0.5,
            frequency_penalty: 0.5,
            stop: ['x'],
          },
        });

        const { body } = await (provider as any).getOpenAiBody('hello');

        expect(body.presence_penalty).toBeUndefined();
        expect(body.frequency_penalty).toBeUndefined();
        expect(body.stop).toBeUndefined();
      });

      it('forwards an explicitly configured reasoning_effort', async () => {
        const provider = new AzureChatCompletionProvider('qa-grok-46', {
          config: { apiHost: 'test.openai.azure.com', reasoning_effort: 'low' },
        });

        const { body } = await (provider as any).getOpenAiBody('hello');

        expect(body.reasoning_effort).toBe('low');
      });

      it('does not inject reasoning_effort when the user did not set one', async () => {
        const provider = new AzureChatCompletionProvider('qa-grok-46', {
          config: { apiHost: 'test.openai.azure.com' },
        });

        const { body } = await (provider as any).getOpenAiBody('hello');

        expect(body.reasoning_effort).toBeUndefined();
      });

      it('keeps a future Grok 10 on the restricted path', async () => {
        const provider = new AzureChatCompletionProvider('grok-10-preview', {
          config: { apiHost: 'test.openai.azure.com', stop: ['x'] },
        });

        const { body } = await (provider as any).getOpenAiBody('hello');

        expect(body.presence_penalty).toBeUndefined();
        expect(body.stop).toBeUndefined();
      });

      it('leaves Grok 3 and grok-code-fast deployments alone', async () => {
        // Only Grok 4 and newer restrict these parameters.
        for (const deployment of ['grok-3', 'grok-3-mini', 'grok-code-fast-1']) {
          const provider = new AzureChatCompletionProvider(deployment, {
            config: { apiHost: 'test.openai.azure.com', stop: ['x'] },
          });

          const { body } = await (provider as any).getOpenAiBody('hello');

          expect(body.presence_penalty).toBeDefined();
          expect(body.frequency_penalty).toBeDefined();
          expect(body.stop).toEqual(['x']);
        }
      });

      it('leaves non-Grok deployments alone', async () => {
        const provider = new AzureChatCompletionProvider('gpt-4o-prod', {
          config: { apiHost: 'test.openai.azure.com', stop: ['x'] },
        });

        const { body } = await (provider as any).getOpenAiBody('hello');

        expect(body.presence_penalty).toBeDefined();
        expect(body.frequency_penalty).toBeDefined();
        expect(body.stop).toEqual(['x']);
      });
    });

    describe('reasoning models', () => {
      const sharedReasoningChecks = createAzureReasoningChecks();

      it('should detect reasoning models with o1 flag', sharedReasoningChecks.detectsO1Flag);

      it(
        'should detect reasoning models with isReasoningModel flag',
        sharedReasoningChecks.detectsReasoningFlag,
      );

      it(
        'should detect reasoning models with either flag set',
        sharedReasoningChecks.detectsEitherReasoningFlag,
      );

      it('should auto-detect o1 models by deployment name', () => {
        const provider = new AzureChatCompletionProvider('o1-preview', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect o3 models by deployment name', () => {
        const provider = new AzureChatCompletionProvider('o3-mini', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect o4 models by deployment name', () => {
        const provider = new AzureChatCompletionProvider('o4-preview', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'])(
        'should auto-detect %s by deployment name',
        (model) => {
          const provider = new AzureChatCompletionProvider(model, {
            config: {},
          });
          expect((provider as any).isReasoningModel()).toBe(true);
        },
      );

      it('should not detect non-reasoning models', () => {
        const provider = new AzureChatCompletionProvider('gpt-4o', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(false);
      });

      it('should auto-detect reasoning models with mixed case', () => {
        const provider = new AzureChatCompletionProvider('GPT-5.4', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect prefixed o1 deployment names', () => {
        const provider = new AzureChatCompletionProvider('prod-o1-preview', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect prefixed gpt-5 deployment names', () => {
        const provider = new AzureChatCompletionProvider('staging-gpt-5.4', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should not detect non-reasoning models with similar names', () => {
        const provider = new AzureChatCompletionProvider('gpt-4-turbo', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(false);
      });

      // Third-party reasoning model detection tests
      it('should auto-detect DeepSeek-R1 reasoning models', () => {
        const provider = new AzureChatCompletionProvider('DeepSeek-R1', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect deepseek-r1 with different separators', () => {
        const providerHyphen = new AzureChatCompletionProvider('deepseek-r1-distill', {
          config: {},
        });
        const providerUnderscore = new AzureChatCompletionProvider('deepseek_r1', {
          config: {},
        });
        expect((providerHyphen as any).isReasoningModel()).toBe(true);
        expect((providerUnderscore as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect Phi-4-reasoning models', () => {
        const provider = new AzureChatCompletionProvider('phi-4-reasoning', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect Phi-4-mini-reasoning models', () => {
        const provider = new AzureChatCompletionProvider('Phi-4-mini-reasoning', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect Grok reasoning models', () => {
        const provider = new AzureChatCompletionProvider('grok-3-reasoning', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should auto-detect grok-mini-reasoning models', () => {
        const provider = new AzureChatCompletionProvider('grok-3-mini-reasoning', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should not detect regular Grok models as reasoning', () => {
        const provider = new AzureChatCompletionProvider('grok-3', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(false);
      });

      it('should not detect regular DeepSeek-V3 as reasoning', () => {
        const provider = new AzureChatCompletionProvider('DeepSeek-V3', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(false);
      });

      it('should not detect regular Phi-4 as reasoning', () => {
        const provider = new AzureChatCompletionProvider('Phi-4', {
          config: {},
        });
        expect((provider as any).isReasoningModel()).toBe(false);
      });

      it(
        'should use max_completion_tokens for reasoning models',
        sharedReasoningChecks.usesCompletionTokenLimit,
      );

      it(
        'should use reasoning_effort for reasoning models',
        sharedReasoningChecks.usesReasoningEffort,
      );

      it(
        'should not include temperature for reasoning models',
        sharedReasoningChecks.omitsTemperature,
      );

      it(
        'should support variable rendering in reasoning_effort',
        sharedReasoningChecks.rendersReasoningEffort,
      );
    });
  });

  describe('AzureCompletionProvider', () => {
    it('should handle basic completion with caching', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          choices: [{ text: 'hello' }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
      } as any);

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          choices: [{ text: 'hello' }],
          usage: { total_tokens: 10 },
        },
        cached: true,
      } as any);

      const provider = new AzureCompletionProvider('test', {
        config: { apiHost: 'test.azure.com' },
      });
      (provider as any).authHeaders = {};

      const result1 = await provider.callApi('test prompt');
      const result2 = await provider.callApi('test prompt');

      expect(result1.output).toBe('hello');
      expect(result2.output).toBe('hello');
      expect(result1.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
      expect(result2.tokenUsage).toEqual({ cached: 10, total: 10 });
    });
  });
});
