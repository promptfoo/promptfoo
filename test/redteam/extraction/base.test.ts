import logger from '../../../src/logger';
import { ExtractionBase } from '../../../src/redteam/extraction/base';
import { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
}));

class TestExtractor extends ExtractionBase<string[]> {
  protected generatePrompt(prompts: string[]): string {
    return `Test prompt for: ${prompts.join(', ')}`;
  }

  protected processOutput(output: string): string[] {
    return output.split(',').map((item) => item.trim());
  }
}

describe('ExtractionBase', () => {
  let provider: ApiProvider;
  let extractor: TestExtractor;

  beforeEach(() => {
    provider = {
      callApi: jest.fn().mockResolvedValue({ output: 'item1, item2, item3' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    extractor = new TestExtractor(provider);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should extract data correctly', async () => {
    const result = await extractor.extract(['prompt1', 'prompt2']);
    expect(result).toEqual(['item1', 'item2', 'item3']);
    expect(provider.callApi).toHaveBeenCalledWith('Test prompt for: prompt1, prompt2');
  });

  it('should throw an error if API call fails', async () => {
    const error = new Error('API error');
    jest.mocked(provider.callApi).mockResolvedValue({ error: error.message });

    await expect(extractor.extract(['prompt'])).rejects.toThrow(
      'Failed to perform extraction: API error',
    );
    expect(logger.error).toHaveBeenCalledWith('Error in extraction: API error');
  });

  it('should throw an error if output is not a string', async () => {
    jest.mocked(provider.callApi).mockResolvedValue({ output: 123 });

    await expect(extractor.extract(['prompt'])).rejects.toThrow(
      'Invalid extraction output: expected string, got: 123',
    );
    expect(logger.error).toHaveBeenCalledWith('Invalid output from extraction. Got: 123');
  });

  it('should format prompts correctly', () => {
    const formattedPrompts = extractor['formatPrompts'](['prompt1', 'prompt2']);
    expect(formattedPrompts).toBe('<prompt>\nprompt1\n</prompt>\n<prompt>\nprompt2\n</prompt>');
  });
});
