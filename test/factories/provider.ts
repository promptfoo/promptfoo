import { vi } from 'vitest';

import type { ApiProvider, ProviderResponse, TokenUsage } from '../../src/types/index';

export type MockApiProvider = ApiProvider & {
  id: ReturnType<typeof vi.fn<() => string>>;
  callApi: ReturnType<typeof vi.fn<ApiProvider['callApi']>>;
  cleanup?: ReturnType<typeof vi.fn<NonNullable<ApiProvider['cleanup']>>>;
};

export type MockProviderOptions = Omit<Partial<ApiProvider>, 'callApi' | 'cleanup' | 'id'> & {
  callApi?: ApiProvider['callApi'];
  cleanup?: ApiProvider['cleanup'] | boolean;
  id?: string | (() => string);
  response?: ProviderResponse;
};

export function createTokenUsage(overrides: TokenUsage = {}): TokenUsage {
  return {
    total: 10,
    prompt: 5,
    completion: 5,
    cached: 0,
    numRequests: 1,
    ...overrides,
  };
}

export function createRequiredTokenUsage(overrides: TokenUsage = {}): Required<TokenUsage> {
  return {
    total: 10,
    prompt: 5,
    completion: 5,
    cached: 0,
    numRequests: 1,
    ...overrides,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      ...overrides.completionDetails,
    },
    assertions: {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
      ...overrides.assertions,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        ...overrides.assertions?.completionDetails,
      },
    },
  };
}

export function createProviderResponse(
  overrides: Partial<ProviderResponse> = {},
): ProviderResponse {
  return {
    output: 'Test output',
    tokenUsage: createTokenUsage(),
    ...overrides,
  };
}

function resolveIdImpl(id: string | (() => string) = 'test-provider'): () => string {
  return typeof id === 'function' ? id : () => id;
}

export function createMockProvider(options: MockProviderOptions = {}): MockApiProvider {
  const {
    callApi,
    cleanup,
    id,
    response = createProviderResponse(),
    ...providerOverrides
  } = options;

  const provider: MockApiProvider = {
    id: vi.fn<() => string>().mockImplementation(resolveIdImpl(id)),
    callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(callApi ?? (async () => response)),
    ...providerOverrides,
  };

  if (cleanup) {
    provider.cleanup = vi
      .fn<NonNullable<ApiProvider['cleanup']>>()
      .mockImplementation(cleanup === true ? async () => undefined : cleanup);
  }

  return provider;
}

export function resetMockProvider(
  provider: MockApiProvider,
  options: { id?: string | (() => string); response?: ProviderResponse } = {},
): void {
  const { id, response = createProviderResponse() } = options;
  provider.id.mockReset().mockImplementation(resolveIdImpl(id));
  provider.callApi.mockReset().mockResolvedValue(response);
  provider.cleanup?.mockReset().mockResolvedValue(undefined);
}
