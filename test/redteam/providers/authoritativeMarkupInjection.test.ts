import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../../src/util/tokenUsageUtils';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../factories/provider';

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
  getRemoteGenerationHeaders: vi.fn((extra) => ({ 'Content-Type': 'application/json', ...extra })),
  neverGenerateRemote: vi.fn().mockReturnValue(false),
}));

describe('AuthoritativeMarkupInjectionProvider', () => {
  let AuthoritativeMarkupInjectionProvider: typeof import('../../../src/redteam/providers/authoritativeMarkupInjection').default;
  let mockTargetProvider: MockApiProvider;

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

    mockTargetProvider = createMockProvider({
      response: createProviderResponse({ output: 'target response' }),
    });

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

  it('should include target context in remote generation requests', async () => {
    const provider = new AuthoritativeMarkupInjectionProvider({
      injectVar: 'input',
      targetId: 'cloud-target-123',
    });

    await provider.callApi('test prompt', createMockContext(mockTargetProvider));

    const request = mockFetchWithProxy.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(JSON.parse(request?.body ?? '{}')).toMatchObject({
      targetId: 'cloud-target-123',
      task: 'authoritative-markup-injection',
    });
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
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      options,
    );
  });

  describe('Token Usage Tracking', () => {
    it('keeps remote attack generation separate from target tokens and probes', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({
          message: { role: 'assistant', content: 'injected content' },
          tokenUsage: {
            prompt: 20,
            completion: 8,
            total: 28,
            completionDetails: { reasoning: 3 },
          },
        }),
      });
      mockTargetProvider.callApi.mockResolvedValueOnce({
        output: 'target response',
        tokenUsage: { prompt: 5, completion: 4, total: 9, numRequests: 1 },
      });

      const provider = new AuthoritativeMarkupInjectionProvider({ injectVar: 'input' });
      const result = await provider.callApi('test prompt', createMockContext(mockTargetProvider));

      expect(result.tokenUsage).toMatchObject({
        total: 9,
        numRequests: 1,
        attacker: {
          prompt: 20,
          completion: 8,
          total: 28,
          numRequests: 1,
          completionDetails: { reasoning: 3 },
        },
      });
    });

    it('retains fresh attacker tokens when the target response is reused from cache', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({
          message: { role: 'assistant', content: 'injected content' },
          tokenUsage: { prompt: 20, completion: 8, total: 28, numRequests: 1 },
        }),
      });
      mockTargetProvider.callApi.mockResolvedValueOnce({
        output: 'cached target response',
        cached: true,
        tokenUsage: { prompt: 50, completion: 25, total: 75, numRequests: 1 },
      });

      const provider = new AuthoritativeMarkupInjectionProvider({ injectVar: 'input' });
      const result = await provider.callApi('test prompt', createMockContext(mockTargetProvider));
      const normalizedUsage = createEmptyTokenUsage();
      accumulateResponseTokenUsage(normalizedUsage, result);

      expect(result.cached).toBe(true);
      expect(normalizedUsage).toMatchObject({
        total: 75,
        cached: 75,
        numRequests: 1,
        attacker: { total: 28, prompt: 20, completion: 8, numRequests: 1 },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          attacker: { total: 28, prompt: 20, completion: 8, numRequests: 1 },
        },
      });
    });

    it('should accumulate token usage from target provider', async () => {
      mockTargetProvider.callApi.mockResolvedValue({
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
      mockTargetProvider.callApi.mockResolvedValue({
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
      mockTargetProvider.callApi.mockResolvedValue({
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
      mockTargetProvider.callApi.mockResolvedValue({
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
