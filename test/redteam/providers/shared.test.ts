import { OpenAiChatCompletionProvider } from '../../../src/providers/openai';
import {
  ATTACKER_MODEL,
  ATTACKER_MODEL_SMALL,
  TEMPERATURE,
} from '../../../src/redteam/providers/constants';
import { loadRedteamProvider } from '../../../src/redteam/providers/shared';

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

describe('loadRedteamProvider', () => {
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the provided ApiProvider', async () => {
    const mockApiProvider = { id: jest.fn(), callApi: jest.fn() };
    const result = await loadRedteamProvider({ provider: mockApiProvider });
    expect(result).toBe(mockApiProvider);
  });

  it('should use default provider when no provider is specified', async () => {
    jest.mocked(OpenAiChatCompletionProvider).mockReturnValue(mockOpenAiProvider);
    const result = await loadRedteamProvider();
    expect(result).toBe(mockOpenAiProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(ATTACKER_MODEL, {
      config: {
        temperature: TEMPERATURE,
        response_format: undefined,
      },
    });
  });

  it('should use small model when preferSmallModel is true', async () => {
    jest.mocked(OpenAiChatCompletionProvider).mockReturnValue(mockOpenAiProvider);
    const result = await loadRedteamProvider({ preferSmallModel: true });
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
    const result = await loadRedteamProvider({ jsonOnly: true });
    expect(result).toBe(mockOpenAiProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(ATTACKER_MODEL, {
      config: {
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
      },
    });
  });
});
