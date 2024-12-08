import cliState from '../../../src/cliState';
import { loadApiProviders } from '../../../src/providers';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai';
import {
  ATTACKER_MODEL,
  ATTACKER_MODEL_SMALL,
  TEMPERATURE,
} from '../../../src/redteam/providers/constants';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';

jest.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: {
    config: {
      redteam: {
        provider: null,
      },
    },
  },
}));

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
}));

jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn(),
}));

jest.mock('../../../src/providers/openai', () => ({
  OpenAiChatCompletionProvider: jest.fn(),
}));

describe('redteamProviderManager', () => {
  const mockOpenAiProvider = {
    id: jest.fn(),
    callApi: jest.fn(),
    config: {},
    modelName: 'mock-model',
    getOrganization: jest.fn(),
    getApiUrlDefault: jest.fn(),
    getApiKey: jest.fn(),
    getApiUrl: jest.fn(),
  } as unknown as OpenAiChatCompletionProvider;

  const mockLoadedProvider = { id: () => 'loaded-provider', callApi: jest.fn() };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the provided ApiProvider', async () => {
    const mockApiProvider = { id: jest.fn(), callApi: jest.fn() };
    const result = await redteamProviderManager.getProvider({ provider: mockApiProvider });
    expect(result).toBe(mockApiProvider);
  });

  it('should load provider from string', async () => {
    jest.mocked(loadApiProviders).mockResolvedValue([mockLoadedProvider]);
    const result = await redteamProviderManager.getProvider({ provider: 'test-provider' });
    expect(result).toBe(mockLoadedProvider);
    expect(loadApiProviders).toHaveBeenCalledWith(['test-provider']);
  });

  it('should load provider from ProviderOptions', async () => {
    const providerOptions = { id: 'test-provider', apiKey: 'test-key' };
    jest.mocked(loadApiProviders).mockResolvedValue([mockLoadedProvider]);
    const result = await redteamProviderManager.getProvider({ provider: providerOptions });
    expect(result).toBe(mockLoadedProvider);
    expect(loadApiProviders).toHaveBeenCalledWith([providerOptions]);
  });

  it('should use default provider when no provider is specified', async () => {
    jest.mocked(OpenAiChatCompletionProvider).mockReturnValue(mockOpenAiProvider);
    const result = await redteamProviderManager.getProvider({});
    expect(result).toBe(mockOpenAiProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(ATTACKER_MODEL, {
      config: {
        temperature: TEMPERATURE,
        response_format: undefined,
      },
    });
  });

  it('should use the set provider', async () => {
    jest.mocked(loadApiProviders).mockResolvedValue([mockLoadedProvider]);
    await redteamProviderManager.setProvider(mockLoadedProvider);
    const result = await redteamProviderManager.getProvider({});
    expect(result).toBe(mockLoadedProvider);

    redteamProviderManager.clearProvider();
  });

  it('should use small model when preferSmallModel is true', async () => {
    jest.mocked(OpenAiChatCompletionProvider).mockReturnValue(mockOpenAiProvider);
    const result = await redteamProviderManager.getProvider({ preferSmallModel: true });
    expect(result).toBe(mockOpenAiProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(ATTACKER_MODEL_SMALL, {
      config: {
        temperature: TEMPERATURE,
        response_format: undefined,
      },
    });
  });

  it('should set response_format to json_object when jsonOnly is true', async () => {
    jest.mocked(OpenAiChatCompletionProvider).mockReturnValue(mockOpenAiProvider);
    const result = await redteamProviderManager.getProvider({ jsonOnly: true });
    expect(result).toBe(mockOpenAiProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(ATTACKER_MODEL, {
      config: {
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
      },
    });
  });

  it('should use provider from cliState if available', async () => {
    const mockStateProvider = { id: jest.fn(), callApi: jest.fn() };
    cliState.config!.redteam!.provider = mockStateProvider;
    const result = await redteamProviderManager.getProvider({});
    expect(result).toBe(mockStateProvider);
  });
});
