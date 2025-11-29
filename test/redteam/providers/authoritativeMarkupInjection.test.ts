import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ApiProvider, CallApiContextParams } from '../../../src/types/index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchWithProxy = jest.fn<any>();

jest.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: (...args: unknown[]) => mockFetchWithProxy(...args),
}));

jest.mock('../../../src/evaluatorHelpers', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderPrompt: jest
    .fn()
    .mockImplementation((_prompt: any, vars: any) => vars.input || 'rendered prompt'),
}));

jest.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn().mockReturnValue('test@example.com'),
}));

jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test.api/generate'),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
}));

describe('AuthoritativeMarkupInjectionProvider - Abort Signal Handling', () => {
  let AuthoritativeMarkupInjectionProvider: typeof import('../../../src/redteam/providers/authoritativeMarkupInjection').default;
  let mockTargetProvider: ApiProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCallApi: jest.Mock<any>;

  const createMockContext = (targetProvider: ApiProvider): CallApiContextParams => ({
    originalProvider: targetProvider,
    vars: { input: 'test input' },
    prompt: { raw: 'test prompt', label: 'test' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Dynamic import after mocks are set up
    const module = await import('../../../src/redteam/providers/authoritativeMarkupInjection');
    AuthoritativeMarkupInjectionProvider = module.default;

    mockCallApi = jest.fn();
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
    jest.clearAllMocks();
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
});
