import { extractSystemPurpose } from '../../../src/redteam/extraction/purpose';
import { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('System Purpose Extractor', () => {
  let provider: ApiProvider;

  beforeEach(() => {
    provider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Extracted system purpose' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.clearAllMocks();
  });

  it('should extract system purpose correctly', async () => {
    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);
    expect(result).toBe('Extracted system purpose');
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt1'));
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt2'));
  });
});
