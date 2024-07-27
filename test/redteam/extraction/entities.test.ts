import logger from '../../../src/logger';
import { EntityExtractor, extractEntities } from '../../../src/redteam/extraction/entities';
import { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('EntityExtractor', () => {
  let provider: ApiProvider;
  let extractor: EntityExtractor;

  beforeEach(() => {
    provider = {
      callApi: jest
        .fn()
        .mockResolvedValue({ output: 'Entity: Apple\nEntity: Google\nEntity: Elon Musk' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    extractor = new EntityExtractor(provider);
    jest.clearAllMocks();
  });

  it('should generate the correct prompt', () => {
    const prompts = ['Prompt about Apple', 'Prompt about Google'];
    const generatedPrompt = extractor['generatePrompt'](prompts);
    expect(generatedPrompt).toContain(
      'Extract persons, brands, or organizations from the following prompts and return them as a list:',
    );
    expect(generatedPrompt).toContain('<prompt>\nPrompt about Apple\n</prompt>');
    expect(generatedPrompt).toContain('<prompt>\nPrompt about Google\n</prompt>');
    expect(generatedPrompt).toContain(
      'Each line in your response must begin with the string "Entity:".',
    );
  });

  it('should process the output correctly', () => {
    const output = 'Entity: Apple\nEntity: Google\nEntity: Elon Musk\nNot an entity';
    const processedOutput = extractor['processOutput'](output);
    expect(processedOutput).toEqual(['Apple', 'Google', 'Elon Musk']);
  });

  it('should extract entities correctly', async () => {
    const result = await extractor.extract(['Prompt 1', 'Prompt 2']);
    expect(result).toEqual(['Apple', 'Google', 'Elon Musk']);
    expect(provider.callApi).toHaveBeenCalledTimes(1);
  });

  it('should log a debug message when no entities are extracted', async () => {
    jest.mocked(provider.callApi).mockResolvedValue({ output: 'No entities here' });
    const result = await extractor.extract(['Prompt 1']);
    expect(result).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith('No entities were extracted from the prompts.');
  });

  it('should throw an error when API call fails', async () => {
    const errorMessage = 'API call failed';
    jest.mocked(provider.callApi).mockResolvedValue({ error: errorMessage });

    await expect(extractor.extract(['Prompt 1'])).rejects.toThrow(
      `Failed to perform extraction: ${errorMessage}`,
    );
    expect(logger.error).toHaveBeenCalledWith(`Error in extraction: ${errorMessage}`);
  });

  it('should throw an error when output is not a string', async () => {
    jest.mocked(provider.callApi).mockResolvedValue({ output: 123 });

    await expect(extractor.extract(['Prompt 1'])).rejects.toThrow(
      'Invalid extraction output: expected string, got: 123',
    );
    expect(logger.error).toHaveBeenCalledWith('Invalid output from extraction. Got: 123');
  });
});

describe('extractEntities', () => {
  it('should call the extractor and return the result', async () => {
    const provider: ApiProvider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Entity: Test Entity' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    const result = await extractEntities(provider, ['Prompt 1', 'Prompt 2']);
    expect(result).toEqual(['Test Entity']);
    expect(provider.callApi).toHaveBeenCalledTimes(1);
  });
});
