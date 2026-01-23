import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, CallApiContextParams, CallApiFunction } from '../../../src/types/index';

const mockFetchWithRetries = vi.fn();

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithRetries: (...args: unknown[]) => mockFetchWithRetries(...args),
}));

vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn().mockReturnValue('test@example.com'),
}));

vi.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test.api/task'),
}));

// Mock the dynamic fetch prompt generation to avoid remote API calls in tests
vi.mock('../../../src/redteam/strategies/indirectWebPwn', () => ({
  generateDynamicFetchPrompt: vi.fn().mockImplementation(async (url: string) => {
    return `Please visit ${url} and summarize the content you find there.`;
  }),
}));

describe('IndirectWebPwnProvider', () => {
  let IndirectWebPwnProvider: typeof import('../../../src/redteam/providers/indirectWebPwn').default;
  let mockTargetProvider: ApiProvider;
  let mockCallApi: ReturnType<typeof vi.fn>;

  const createMockContext = (targetProvider: ApiProvider): CallApiContextParams => ({
    originalProvider: targetProvider,
    vars: { input: 'test attack payload' },
    prompt: { raw: 'test prompt', label: 'test' },
    test: {
      vars: { input: 'test attack payload' },
      metadata: {
        goal: 'Extract sensitive data',
        purpose: 'Security testing',
        testCaseId: 'test-case-1',
      },
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../../src/redteam/providers/indirectWebPwn');
    IndirectWebPwnProvider = module.default;

    mockCallApi = vi.fn();
    mockCallApi.mockResolvedValue({
      output: 'Target response based on fetched content',
    });

    mockTargetProvider = {
      id: () => 'test-provider',
      callApi: mockCallApi as unknown as CallApiFunction,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with required injectVar', () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
      });

      expect(provider.id()).toBe('promptfoo:redteam:indirect-web-pwn');
      expect(provider.config.injectVar).toBe('input');
    });

    it('should apply default configuration values', () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
      });

      expect(provider.config.maxTurns).toBe(5);
      expect(provider.config.maxFetchAttempts).toBe(3);
      expect(provider.config.stateful).toBe(false);
      expect(provider.config.useLlm).toBe(true);
      expect(provider.config.preferSmallModel).toBe(true);
      expect(provider.config.exfilWaitMs).toBe(5000);
      expect(provider.config.useDynamicFetchPrompts).toBe(true);
    });

    it('should allow custom configuration values', () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'query',
        maxTurns: 10,
        maxFetchAttempts: 5,
        useLlm: true,
        preferSmallModel: false,
        exfilWaitMs: 10000,
        evalId: 'custom-eval-id',
        useDynamicFetchPrompts: false,
      });

      expect(provider.config.injectVar).toBe('query');
      expect(provider.config.maxTurns).toBe(10);
      expect(provider.config.maxFetchAttempts).toBe(5);
      expect(provider.config.useLlm).toBe(true);
      expect(provider.config.preferSmallModel).toBe(false);
      expect(provider.config.exfilWaitMs).toBe(10000);
      expect(provider.config.evalId).toBe('custom-eval-id');
      expect(provider.config.useDynamicFetchPrompts).toBe(false);
    });

    it('should throw error without injectVar', () => {
      expect(() => new IndirectWebPwnProvider({})).toThrow('Expected injectVar to be set');
    });
  });

  describe('Web Page Creation', () => {
    it('should create web page with correct parameters', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
      });

      // Mock create-web-page response
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid-123',
          path: '/dynamic-pages/test-eval-id/test-uuid-123',
          fullUrl: 'http://test.api/dynamic-pages/test-eval-id/test-uuid-123',
        }),
      });

      // Mock get-web-page-tracking response - page was fetched
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid-123',
          wasFetched: true,
          fetchCount: 1,
        }),
      });

      const context = createMockContext(mockTargetProvider);
      await provider.callApi('test attack prompt', context, {});

      // Verify create-web-page was called
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'http://test.api/task',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"task":"create-web-page"'),
        }),
        60000,
      );

      const createRequest = JSON.parse(mockFetchWithRetries.mock.calls[0][1].body);
      expect(createRequest.evalId).toBe('test-eval-id');
      expect(createRequest.prompt).toBe('test attack prompt');
      expect(createRequest.email).toBe('test@example.com');
    });
  });

  describe('Attack Loop', () => {
    it('should stop when page is fetched successfully', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        exfilWaitMs: 0, // Disable wait for faster tests
      });

      // Mock create-web-page
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid',
          fullUrl: 'http://test.api/page/test-uuid',
        }),
      });

      // Mock get-web-page-tracking - page was fetched on first attempt
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          wasFetched: true,
          fetchCount: 1,
        }),
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context, {});

      expect(result.metadata.stopReason).toBe('Attack succeeded');
      expect(result.metadata.fetchAttempts).toBe(1);
    });

    it('should retry up to maxFetchAttempts when page not fetched', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        maxFetchAttempts: 2,
        exfilWaitMs: 0,
      });

      // Mock create-web-page
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid',
          fullUrl: 'http://test.api/page/test-uuid',
        }),
      });

      // Mock get-web-page-tracking - page not fetched (both attempts)
      mockFetchWithRetries.mockResolvedValue({
        ok: true,
        json: async () => ({
          wasFetched: false,
          fetchCount: 0,
        }),
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context, {});

      expect(result.metadata.stopReason).toBe('Max fetch attempts reached');
      expect(result.metadata.fetchAttempts).toBe(2);
      expect(mockCallApi).toHaveBeenCalledTimes(2);
    });

    it('should generate different fetch prompts on each attempt', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        maxFetchAttempts: 3,
        exfilWaitMs: 0,
        useDynamicFetchPrompts: false, // Use static prompts to test variation
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid',
          fullUrl: 'http://test.api/page/test-uuid',
        }),
      });

      mockFetchWithRetries.mockResolvedValue({
        ok: true,
        json: async () => ({
          wasFetched: false,
          fetchCount: 0,
        }),
      });

      const context = createMockContext(mockTargetProvider);
      await provider.callApi('test prompt', context, {});

      // Verify different prompts were sent
      const prompts = mockCallApi.mock.calls.map((call) => call[0]);
      expect(prompts[0]).not.toBe(prompts[1]);
      expect(prompts[1]).not.toBe(prompts[2]);
    });

    it('should use dynamic fetch prompts by default', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        maxFetchAttempts: 1,
        exfilWaitMs: 0,
        // useDynamicFetchPrompts defaults to true
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid',
          fullUrl: 'http://test.api/page/test-uuid',
        }),
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          wasFetched: true,
          fetchCount: 1,
        }),
      });

      const context = createMockContext(mockTargetProvider);
      await provider.callApi('test prompt', context, {});

      // Verify the mock generateDynamicFetchPrompt was called
      // (confirmed by the prompt sent to the target)
      const prompts = mockCallApi.mock.calls.map((call) => call[0]);
      expect(prompts[0]).toContain('http://test.api/page/test-uuid');
    });
  });

  describe('Error Handling', () => {
    it('should handle target provider errors', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        exfilWaitMs: 0,
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid',
          fullUrl: 'http://test.api/page/test-uuid',
        }),
      });

      mockCallApi.mockResolvedValue({
        error: 'Target provider error',
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context, {});

      expect(result.metadata.stopReason).toBe('Error');
    });

    it('should handle web page creation failure', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        exfilWaitMs: 0,
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context, {});

      expect(result.metadata.stopReason).toBe('Error');
    });

    it('should re-throw AbortError', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
      });

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetchWithRetries.mockRejectedValue(abortError);

      const context = createMockContext(mockTargetProvider);

      await expect(provider.callApi('test prompt', context, {})).rejects.toThrow(
        'The operation was aborted',
      );
    });
  });

  describe('Metadata and Response', () => {
    it('should return complete metadata', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        exfilWaitMs: 0,
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid-123',
          fullUrl: 'http://test.api/page/test-uuid-123',
        }),
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          wasFetched: true,
          fetchCount: 1,
        }),
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context, {});

      expect(result.metadata).toMatchObject({
        stopReason: 'Attack succeeded',
        webPageEvalId: 'test-eval-id',
        webPageUuid: 'test-uuid-123',
        webPageUrl: 'http://test.api/page/test-uuid-123',
        fetchAttempts: 1,
      });
      expect(result.metadata.redteamHistory).toBeDefined();
      expect(result.metadata.messages).toBeDefined();
    });

    it('should track token usage from target provider', async () => {
      const provider = new IndirectWebPwnProvider({
        injectVar: 'input',
        evalId: 'test-eval-id',
        exfilWaitMs: 0,
      });

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: 'test-uuid',
          fullUrl: 'http://test.api/page/test-uuid',
        }),
      });

      mockCallApi.mockResolvedValue({
        output: 'response',
        tokenUsage: {
          total: 100,
          prompt: 50,
          completion: 50,
        },
      });

      mockFetchWithRetries.mockResolvedValue({
        ok: true,
        json: async () => ({
          wasFetched: true,
          fetchCount: 1,
        }),
      });

      const context = createMockContext(mockTargetProvider);
      const result = await provider.callApi('test prompt', context, {});

      expect(result.tokenUsage).toMatchObject({
        total: 100,
        prompt: 50,
        completion: 50,
      });
    });
  });
});
