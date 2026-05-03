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

/**
 * Shallow-replace the default scaffolding with the caller's overrides. Unlike
 * createRequiredTokenUsage below, this helper does NOT deep-merge nested fields
 * because TokenUsage leaves completionDetails/assertions optional — if a caller
 * passes either, they are declaring the whole shape they want to assert against.
 * Tests in test/redteam/providers/iterativeTree.test.ts rely on this behavior
 * to check exact tokenUsage propagation, so preserve it.
 */
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

/**
 * Returns a Required<TokenUsage> with every nested field populated. Deep-merges
 * completionDetails and assertions because Required<> forces every field to be
 * present — partial overrides for those nested bags would otherwise drop
 * defaults the caller didn't mention. This is the right behavior for fixtures
 * flowing into type-strict slots (e.g. EvaluateResult.tokenUsage).
 */
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

/**
 * Returns a default ProviderResponse. tokenUsage follows the shallow-replace
 * convention from createTokenUsage: callers passing { tokenUsage: {...} } are
 * declaring the exact shape they want to assert on, so we do not deep-merge
 * the default scaffolding into it. If you need defaults preserved, wrap the
 * partial in createTokenUsage(...) at the call site.
 */
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

export type ResetMockProviderOptions = {
  id?: string | (() => string);
  response?: ProviderResponse;
  cleanup?: ApiProvider['cleanup'] | boolean;
};

export function resetMockProvider(
  provider: MockApiProvider,
  options: ResetMockProviderOptions = {},
): void {
  const { id, response = createProviderResponse(), cleanup } = options;
  provider.id.mockReset().mockImplementation(resolveIdImpl(id));
  provider.callApi.mockReset().mockResolvedValue(response);
  if (provider.cleanup) {
    provider.cleanup
      .mockReset()
      .mockImplementation(!cleanup || cleanup === true ? async () => undefined : cleanup);
  }
}
