import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { REQUEST_TIMEOUT_MS } from '../../../src/providers/shared';
import {
  fetchRemoteGeneration,
  callExtraction,
  formatPrompts,
  RedTeamGenerationResponse,
} from '../../../src/redteam/extraction/util';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('fetchRemoteGeneration', () => {
  beforeAll(() => {
    delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch remote generation for purpose task', async () => {
    const mockResponse = {
      data: {
        task: 'purpose',
        result: 'This is a purpose',
      },
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await fetchRemoteGeneration('purpose', ['prompt1', 'prompt2']);

    expect(result).toBe('This is a purpose');
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/v1/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'purpose', prompts: ['prompt1', 'prompt2'] }),
      },
      REQUEST_TIMEOUT_MS,
      'json',
    );
  });

  it('should fetch remote generation for entities task', async () => {
    const mockResponse = {
      data: {
        task: 'entities',
        result: ['Entity1', 'Entity2'],
      },
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await fetchRemoteGeneration('entities', ['prompt1', 'prompt2']);

    expect(result).toEqual(['Entity1', 'Entity2']);
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/v1/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'entities', prompts: ['prompt1', 'prompt2'] }),
      },
      REQUEST_TIMEOUT_MS,
      'json',
    );
  });

  it('should throw an error when fetchWithCache fails', async () => {
    const mockError = new Error('Network error');
    jest.mocked(fetchWithCache).mockRejectedValue(mockError);

    await expect(fetchRemoteGeneration('purpose', ['prompt'])).rejects.toThrow('Network error');
    expect(logger.warn).toHaveBeenCalledWith(
      "Error using remote generation for task 'purpose': Error: Network error",
    );
  });

  it('should throw an error when response parsing fails', async () => {
    const mockResponse = {
      data: {
        task: 'purpose',
        // Missing 'result' field
      },
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    await expect(fetchRemoteGeneration('purpose', ['prompt'])).rejects.toThrow('Invalid input');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Error using remote generation for task 'purpose':"),
    );
  });
});

describe('RedTeamGenerationResponse', () => {
  it('should validate correct response structure', () => {
    const validResponse = {
      task: 'purpose',
      result: 'This is a purpose',
    };

    expect(() => RedTeamGenerationResponse.parse(validResponse)).not.toThrow();
  });

  it('should throw error for invalid response structure', () => {
    const invalidResponse = {
      task: 'purpose',
      // Missing 'result' field
    };

    expect(() => RedTeamGenerationResponse.parse(invalidResponse)).toThrow('Invalid input');
  });

  it('should validate response with string result', () => {
    const response = {
      task: 'purpose',
      result: 'This is a purpose',
    };

    expect(() => RedTeamGenerationResponse.parse(response)).not.toThrow();
  });

  it('should validate response with array result', () => {
    const response = {
      task: 'entities',
      result: ['Entity1', 'Entity2'],
    };

    expect(() => RedTeamGenerationResponse.parse(response)).not.toThrow();
  });
});

describe('Extraction Utils', () => {
  let provider: ApiProvider;

  beforeEach(() => {
    provider = {
      callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.clearAllMocks();
  });

  describe('callExtraction', () => {
    it('should call API and process output correctly', async () => {
      const result = await callExtraction(provider, 'test prompt', (output) =>
        output.toUpperCase(),
      );
      expect(result).toBe('TEST OUTPUT');
      expect(provider.callApi).toHaveBeenCalledWith('test prompt');
    });

    it('should throw an error if API call fails', async () => {
      const error = new Error('API error');
      jest.mocked(provider.callApi).mockResolvedValue({ error: error.message });

      await expect(callExtraction(provider, 'test prompt', jest.fn())).rejects.toThrow(
        'Failed to perform extraction: API error',
      );
    });

    it('should throw an error if output is not a string', async () => {
      jest.mocked(provider.callApi).mockResolvedValue({ output: 123 });

      await expect(callExtraction(provider, 'test prompt', jest.fn())).rejects.toThrow(
        'Invalid extraction output: expected string, got: 123',
      );
    });

    it('should handle empty string output', async () => {
      jest.mocked(provider.callApi).mockResolvedValue({ output: '' });

      const result = await callExtraction(provider, 'test prompt', (output) => output.length);
      expect(result).toBe(0);
    });

    it('should handle null output', async () => {
      jest.mocked(provider.callApi).mockResolvedValue({ output: null });

      await expect(callExtraction(provider, 'test prompt', jest.fn())).rejects.toThrow(
        'Invalid extraction output: expected string, got: null',
      );
    });

    it('should handle undefined output', async () => {
      jest.mocked(provider.callApi).mockResolvedValue({ output: undefined });

      await expect(callExtraction(provider, 'test prompt', jest.fn())).rejects.toThrow(
        'Invalid extraction output: expected string, got: undefined',
      );
    });
  });

  describe('formatPrompts', () => {
    it('should format prompts correctly', () => {
      const formattedPrompts = formatPrompts(['prompt1', 'prompt2']);
      expect(formattedPrompts).toBe('<Prompt>\nprompt1\n</Prompt>\n<Prompt>\nprompt2\n</Prompt>');
    });
  });
});
