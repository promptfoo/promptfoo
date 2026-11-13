import { expect, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { createChatUsage, createJsonPromptContext } from '../../factories/literalFixtures';
import { createMockFetchResponse } from '../mockProviderResponses';

export const createAzureResponseChecks = (getProvider: () => AzureChatCompletionProvider) => ({
  parsesPromptJson: async () => {
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
            content: '{"result": 42, "explanation": "test"}',
          },
          finish_reason: 'stop',
        },
      ],
      usage: createChatUsage(),
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

    const result = await getProvider().callApi('test prompt', createJsonPromptContext());

    expect(result.output).toEqual({
      result: 42,
      explanation: 'test',
    });
  },
  preservesInvalidPromptJson: async () => {
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
            content: 'Invalid JSON response',
          },
          finish_reason: 'stop',
        },
      ],
      usage: createChatUsage(),
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

    const result = await getProvider().callApi('test prompt', createJsonPromptContext());

    // Should still return the original string if JSON parsing fails
    expect(result.output).toBe('Invalid JSON response');
  },
});

export const createAzureReasoningChecks = () => ({
  detectsO1Flag: () => {
    const provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        o1: true,
      },
    });
    expect((provider as any).isReasoningModel()).toBe(true);
  },
  detectsReasoningFlag: () => {
    const provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        isReasoningModel: true,
      },
    });
    expect((provider as any).isReasoningModel()).toBe(true);
  },
  detectsEitherReasoningFlag: () => {
    const provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        o1: false,
        isReasoningModel: true,
      },
    });
    expect((provider as any).isReasoningModel()).toBe(true);
  },
  usesCompletionTokenLimit: async () => {
    const provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        isReasoningModel: true,
        max_completion_tokens: 2000,
        max_tokens: 1000,
      },
    });
    const { body } = await (provider as any).getOpenAiBody('test prompt');
    expect(body).toHaveProperty('max_completion_tokens', 2000);
    expect(body).not.toHaveProperty('max_tokens');
  },
  usesReasoningEffort: async () => {
    const provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        isReasoningModel: true,
        reasoning_effort: 'high',
      },
    });
    const { body } = await (provider as any).getOpenAiBody('test prompt');
    expect(body).toHaveProperty('reasoning_effort', 'high');
  },
  omitsTemperature: async () => {
    const provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        isReasoningModel: true,
        temperature: 0.7,
      },
    });
    const { body } = await (provider as any).getOpenAiBody('test prompt');
    expect(body).not.toHaveProperty('temperature');
  },
  rendersReasoningEffort: async () => {
    const provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        isReasoningModel: true,
        reasoning_effort: '{{effort}}' as any,
        apiHost: 'test.azure.com',
      },
    });
    const context = {
      prompt: { label: 'test prompt', raw: 'test prompt' },
      vars: { effort: 'high' as const },
    };
    const { body } = await (provider as any).getOpenAiBody('test prompt', context);
    expect(body).toHaveProperty('reasoning_effort', 'high');
  },
});
