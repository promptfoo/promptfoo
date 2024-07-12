import { getPurpose } from '../../src/redteam/purpose';
import { ApiProvider } from '../../src/types';

describe('getPurpose', () => {
  let mockProvider: jest.Mocked<ApiProvider>;
  beforeEach(() => {
    mockProvider = {
      id: jest.fn(),
      callApi: jest.fn(),
    };
  });

  it('should correctly parse a valid API response', async () => {
    const mockOutput = 'Analyze medical images for anomalies';

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    const result = await getPurpose(mockProvider, ['Some prompt']);

    expect(result).toBe('Analyze medical images for anomalies');
  });

  it('should handle multiple prompts correctly', async () => {
    const mockOutput = 'Analyze multiple medical parameters';

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    const prompts = ['Prompt 1', 'Prompt 2', 'Prompt 3'];

    const result = await getPurpose(mockProvider, prompts);

    expect(result).toBe('Analyze multiple medical parameters');

    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining('Prompt 1'));
    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining('Prompt 2'));
    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining('Prompt 3'));
  });

  it('should throw an error if API call fails', async () => {
    mockProvider.callApi.mockRejectedValue(new Error('API call failed'));

    await expect(getPurpose(mockProvider, ['Some prompt'])).rejects.toThrow('API call failed');
  });

  it('should throw an error if purpose is not a string', async () => {
    mockProvider.callApi.mockResolvedValue({ output: 123 });

    await expect(getPurpose(mockProvider, ['Some prompt'])).rejects.toThrow(
      'Expected purpose to be a string',
    );
  });
});
