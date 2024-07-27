import logger from '../../../src/logger';
import { extractEntities } from '../../../src/redteam/extraction/entities';
import { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('Entities Extractor', () => {
  let provider: ApiProvider;

  beforeEach(() => {
    provider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Entity: Apple\nEntity: Google' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.clearAllMocks();
  });

  it('should extract entities correctly', async () => {
    const result = await extractEntities(provider, ['prompt1', 'prompt2']);
    expect(result).toEqual(['Apple', 'Google']);
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt1'));
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt2'));
  });

  it('should log debug message when no entities are found', async () => {
    jest.mocked(provider.callApi).mockResolvedValue({ output: 'No entities found' });
    const result = await extractEntities(provider, ['prompt']);
    expect(result).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith('No entities were extracted from the prompts.');
  });
});
