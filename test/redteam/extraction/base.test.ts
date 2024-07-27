import logger from '../../../src/logger';
import { callExtraction, formatPrompts } from '../../../src/redteam/extraction/util';
import { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
}));

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
      expect(logger.error).toHaveBeenCalledWith('Error in extraction: API error');
    });

    it('should throw an error if output is not a string', async () => {
      jest.mocked(provider.callApi).mockResolvedValue({ output: 123 });

      await expect(callExtraction(provider, 'test prompt', jest.fn())).rejects.toThrow(
        'Invalid extraction output: expected string, got: 123',
      );
      expect(logger.error).toHaveBeenCalledWith('Invalid output from extraction. Got: 123');
    });
  });

  describe('formatPrompts', () => {
    it('should format prompts correctly', () => {
      const formattedPrompts = formatPrompts(['prompt1', 'prompt2']);
      expect(formattedPrompts).toBe('<prompt>\nprompt1\n</prompt>\n<prompt>\nprompt2\n</prompt>');
    });
  });
});
