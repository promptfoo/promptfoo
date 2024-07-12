import logger from '../../src/logger';
import { getPurpose } from '../../src/redteam/purpose';
import { ApiProvider } from '../../src/types';

// Mock the logger to avoid console output during tests
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('getPurpose', () => {
  let mockProvider: jest.Mocked<ApiProvider>;
  beforeEach(() => {
    mockProvider = {
      id: jest.fn(),
      callApi: jest.fn(),
    };
  });

  it('should correctly parse a valid API response', async () => {
    const mockOutput = JSON.stringify({
      intent: 'Analyze medical images for anomalies',
      variables: ['patientId', 'imageType'],
    });

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    const result = await getPurpose(mockProvider, ['Some prompt']);

    expect(result).toEqual({
      intent: 'Analyze medical images for anomalies',
      variables: ['patientId', 'imageType'],
    });
  });

  it('should handle API responses with JSON wrapped in code blocks', async () => {
    const mockOutput =
      '```json\n{"intent": "Process patient data", "variables": ["name", "age", "symptoms"]}\n```';

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    const result = await getPurpose(mockProvider, ['Some prompt']);

    expect(result).toEqual({
      intent: 'Process patient data',
      variables: ['name', 'age', 'symptoms'],
    });
  });

  it('should handle multiple prompts correctly', async () => {
    const mockOutput = JSON.stringify({
      intent: 'Analyze multiple medical parameters',
      variables: ['bloodPressure', 'heartRate', 'oxygenSaturation'],
    });

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    const prompts = ['Prompt 1', 'Prompt 2', 'Prompt 3'];

    const result = await getPurpose(mockProvider, prompts);

    expect(result).toEqual({
      intent: 'Analyze multiple medical parameters',
      variables: ['bloodPressure', 'heartRate', 'oxygenSaturation'],
    });

    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining('Prompt 1'));
    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining('Prompt 2'));
    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining('Prompt 3'));
  });

  it('should log debug information', async () => {
    const mockOutput = JSON.stringify({
      intent: 'Log patient vitals',
      variables: ['patientId', 'temperature', 'bloodPressure'],
    });

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    await getPurpose(mockProvider, ['Some prompt']);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('purpose and prompt variables:'),
    );
  });

  it('should throw an error if API call fails', async () => {
    mockProvider.callApi.mockRejectedValue(new Error('API call failed'));

    await expect(getPurpose(mockProvider, ['Some prompt'])).rejects.toThrow('API call failed');
  });

  it('should return default object when parsing fails', async () => {
    const mockOutput = 'Invalid JSON';

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    const result = await getPurpose(mockProvider, ['Some prompt']);

    expect(result).toEqual({
      intent: undefined,
      variables: undefined,
    });

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse purpose:'));
  });
});
