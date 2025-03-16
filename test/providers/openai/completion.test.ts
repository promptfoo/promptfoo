import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import { OpenAiCompletionProvider } from '../../../src/providers/openai/completion';

jest.mock('../../../src/cache');

const mockFetchWithCache = jest.mocked(fetchWithCache);

describe('OpenAI Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiCompletionProvider', () => {
    it('should call API successfully with text completion', async () => {
      const mockResponse = {
        data: {
          choices: [{ text: 'Test output' }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        severity: 'info',
      };
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    });
  });
});
