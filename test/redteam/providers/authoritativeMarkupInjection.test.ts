import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, CallApiContextParams } from '../../../src/types/index';

const mockFetchWithProxy = vi.fn();

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: (...args: unknown[]) => mockFetchWithProxy(...args),
}));

vi.mock('../../../src/evaluatorHelpers', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderPrompt: vi
    .fn()
    .mockImplementation((_prompt: any, vars: any) => vars.input || 'rendered prompt'),
}));

vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn().mockReturnValue('test@example.com'),
}));

vi.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test.api/generate'),
  neverGenerateRemote: vi.fn().mockReturnValue(false),
}));

describe('AuthoritativeMarkupInjectionProvider', () => {
  let AuthoritativeMarkupInjectionProvider: typeof import('../../../src/redteam/providers/authoritativeMarkupInjection').default;
  let mockTargetProvider: ApiProvider;
  let mockCallApi: ReturnType<typeof vi.fn>;

  const createMockContext = (targetProvider: ApiProvider): CallApiContextParams => ({
    originalProvider: targetProvider,
    vars: { input: 'test input' },
    prompt: { raw: 'test prompt', label: 'test' },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamic import after mocks are set up
    const module = await import('../../../src/redteam/providers/authoritativeMarkupInjection');
    AuthoritativeMarkupInjectionProvider = module.default;

    mockCallApi = vi.fn();
    mockCallApi.mockResolvedValue({
      output: 'target response',
    });

    mockTargetProvider = {
      id: () => 'test-provider',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callApi: mockCallApi as any,
    };

    // Mock successful response from remote API
    mockFetchWithProxy.mockResolvedValue({
      json: async () => ({
        message: { role: 'assistant', content: 'injected content' },
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pass abortSignal to fetchWithProxy', async () => {
    const provider = new AuthoritativeMarkupInjectionProvider({
      injectVar: 'input',
    });

    const abortController = new AbortController();
    const context = createMockContext(mockTargetProvider);

    await provider.callApi('test prompt', context, { abortSignal: abortController.signal });

    expect(mockFetchWithProxy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      abortController.signal,
    );
  });

  it('should pass options to target provider callApi', async () => {
    const provider = new AuthoritativeMarkupInjectionProvider({
      injectVar: 'input',
    });

    const abortController = new AbortController();
    const context = createMockContext(mockTargetProvider);
    const options = { abortSignal: abortController.signal };

    await provider.callApi('test prompt', context, options);

    // The target provider should be called with the options
    expect(mockCallApi).toHaveBeenCalledWith(expect.any(String), expect.any(Object), options);
  });

  describe('Token Usage Tracking', () => {
    it('should accumulate token usage from target provider', async () => {
      mockCallApi.mockResolvedValue({
        output: 'target response',
        tokenUsage: { prompt: 50, completion: 25, total: 75, numRequests: 1 },
      });

      const provider = new AuthoritativeMarkupInjectionProvider({
        injectVar: 'input',
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context);

      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.prompt).toBe(50);
      expect(result.tokenUsage?.completion).toBe(25);
      expect(result.tokenUsage?.total).toBe(75);
      expect(result.tokenUsage?.numRequests).toBe(1);
    });

    it('should return token usage even when target provider returns error', async () => {
      mockCallApi.mockResolvedValue({
        output: '',
        error: 'Target provider error',
        tokenUsage: { prompt: 10, completion: 0, total: 10, numRequests: 1 },
      });

      const provider = new AuthoritativeMarkupInjectionProvider({
        injectVar: 'input',
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context);

      expect(result.error).toBe('Target provider error');
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBe(1);
    });

    it('should handle target provider with no token usage', async () => {
      mockCallApi.mockResolvedValue({
        output: 'response without token usage',
      });

      const provider = new AuthoritativeMarkupInjectionProvider({
        injectVar: 'input',
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context);

      // Should still have token usage object with numRequests counted
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBe(1);
    });

    it('should include metadata with redteamFinalPrompt', async () => {
      mockCallApi.mockResolvedValue({
        output: 'target response',
        tokenUsage: { prompt: 50, completion: 25, total: 75, numRequests: 1 },
      });

      const provider = new AuthoritativeMarkupInjectionProvider({
        injectVar: 'input',
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.redteamFinalPrompt).toBeDefined();
    });
  });
});
