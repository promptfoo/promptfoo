import { extractSystemPurpose } from '../../../src/redteam/extraction/purpose';
import { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('System Purpose Extractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract system purpose when returned in xml', async () => {
    const provider: ApiProvider = {
      callApi: jest
        .fn()
        .mockResolvedValue({ output: '<Purpose>Extracted system purpose</Purpose>' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    await expect(extractSystemPurpose(provider, ['prompt1', 'prompt2'])).resolves.toBe(
      'Extracted system purpose',
    );
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt1'));
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt2'));
  });

  it('should extract system purpose when returned without xml tags', async () => {
    const provider: ApiProvider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Extracted system purpose' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    await expect(extractSystemPurpose(provider, ['prompt1', 'prompt2'])).resolves.toBe(
      'Extracted system purpose',
    );
  });
});
