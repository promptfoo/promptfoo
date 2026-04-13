import { vi } from 'vitest';

import type { ApiProvider, Prompt, ProviderResponse } from '../../src/types/index';

const mockApiProvider: ApiProvider = {
  id: vi.fn<ApiProvider['id']>(),
  callApi: vi.fn<ApiProvider['callApi']>(),
};

const mockApiProvider2: ApiProvider = {
  id: vi.fn<ApiProvider['id']>(),
  callApi: vi.fn<ApiProvider['callApi']>(),
};

const mockReasoningApiProvider: ApiProvider = {
  id: vi.fn<ApiProvider['id']>(),
  callApi: vi.fn<ApiProvider['callApi']>(),
};

const mockGradingApiProviderPasses: ApiProvider = {
  id: vi.fn<ApiProvider['id']>(),
  callApi: vi.fn<ApiProvider['callApi']>(),
};

const mockGradingApiProviderFails: ApiProvider = {
  id: vi.fn<ApiProvider['id']>(),
  callApi: vi.fn<ApiProvider['callApi']>(),
};

function defaultTokenUsage() {
  return { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 };
}

function defaultProviderResponse(): ProviderResponse {
  return {
    output: 'Test output',
    tokenUsage: defaultTokenUsage(),
  };
}

function resetProvider(provider: ApiProvider, id: string, response: ProviderResponse) {
  vi.mocked(provider.id).mockReset().mockReturnValue(id);
  vi.mocked(provider.callApi).mockReset().mockResolvedValue(response);
}

function resetMockProviders() {
  resetProvider(mockApiProvider, 'test-provider', defaultProviderResponse());
  resetProvider(mockApiProvider2, 'test-provider-2', defaultProviderResponse());
  resetProvider(mockReasoningApiProvider, 'test-reasoning-provider', {
    output: 'Test output',
    tokenUsage: {
      total: 21,
      prompt: 9,
      completion: 12,
      cached: 0,
      numRequests: 1,
      completionDetails: { reasoning: 11, acceptedPrediction: 12, rejectedPrediction: 13 },
    },
  });
  resetProvider(mockGradingApiProviderPasses, 'test-grading-provider', {
    output: JSON.stringify({ pass: true, reason: 'Test grading output' }),
    tokenUsage: defaultTokenUsage(),
  });
  resetProvider(mockGradingApiProviderFails, 'test-grading-provider', {
    output: JSON.stringify({ pass: false, reason: 'Grading failed reason' }),
    tokenUsage: defaultTokenUsage(),
  });
}

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

resetMockProviders();

export {
  mockApiProvider,
  mockApiProvider2,
  mockGradingApiProviderFails,
  mockGradingApiProviderPasses,
  mockReasoningApiProvider,
  resetMockProviders,
  toPrompt,
};
