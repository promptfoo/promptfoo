import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, CallApiContextParams } from '../../../src/types/index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchWithProxy = vi.fn<any>();

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
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

describe('BestOfNProvider - Abort Signal Handling', () => {
  let BestOfNProvider: typeof import('../../../src/redteam/providers/bestOfN').default;
  let mockTargetProvider: ApiProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCallApi: Mock<any>;

  const createMockContext = (targetProvider: ApiProvider): CallApiContextParams => ({
    originalProvider: targetProvider,
    vars: { input: 'test input' },
    prompt: { raw: 'test prompt', label: 'test' },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamic import after mocks are set up
    const module = await import('../../../src/redteam/providers/bestOfN');
    BestOfNProvider = module.default;

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
        modifiedPrompts: ['candidate 1', 'candidate 2'],
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pass abortSignal to fetchWithProxy', async () => {
    const provider = new BestOfNProvider({
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
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });

    const abortController = new AbortController();
    const context = createMockContext(mockTargetProvider);
    const options = { abortSignal: abortController.signal };

    await provider.callApi('test prompt', context, options);

    // The target provider should be called with the options
    expect(mockCallApi).toHaveBeenCalledWith(expect.any(String), expect.any(Object), options);
  });

  it('should re-throw AbortError and not swallow it', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetchWithProxy.mockRejectedValue(abortError);

    const context = createMockContext(mockTargetProvider);

    await expect(provider.callApi('test prompt', context)).rejects.toThrow(
      'The operation was aborted',
    );
  });

  it('should swallow non-AbortError exceptions and return error response', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });

    const regularError = new Error('Network error');
    mockFetchWithProxy.mockRejectedValue(regularError);

    const context = createMockContext(mockTargetProvider);

    const result = await provider.callApi('test prompt', context);

    // Non-AbortError should be caught and returned as an error response
    expect(result.error).toContain('Network error');
  });
});
