import logger from '../../src/logger';
import { getPurpose } from '../../src/redteam/purpose';
import { ApiProvider } from '../../src/types';

// Mock the logger to avoid console output during tests
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
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

  it('should throw an error if intent is not a string', async () => {
    const mockOutput = JSON.stringify({
      intent: 123,
      variables: ['test'],
    });

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    await expect(getPurpose(mockProvider, ['Some prompt'])).rejects.toThrow(
      'Expected intent to be a string, got: 123',
    );
  });

  it('should throw an error if variables is not an array', async () => {
    const mockOutput = JSON.stringify({
      intent: 'Valid intent',
      variables: 'not an array',
    });

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    await expect(getPurpose(mockProvider, ['Some prompt'])).rejects.toThrow(
      'Expected variables to be an array, got: not an array',
    );
  });

  it('should throw an error if variables array is empty', async () => {
    const mockOutput = JSON.stringify({
      intent: 'Valid intent',
      variables: [],
    });

    mockProvider.callApi.mockResolvedValue({ output: mockOutput });

    await expect(getPurpose(mockProvider, ['Some prompt'])).rejects.toThrow(
      'Variables must not be empty',
    );
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

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Purpose:'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('result:'));
  });

  it('should throw an error if API call fails', async () => {
    mockProvider.callApi.mockRejectedValue(new Error('API call failed'));

    await expect(getPurpose(mockProvider, ['Some prompt'])).rejects.toThrow('API call failed');
  });
});
