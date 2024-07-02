import { PythonProvider } from '../src/providers/pythonCompletion';
import { runPython } from '../src/python/wrapper';

jest.mock('../src/python/wrapper', () => ({
  runPython: jest.fn(),
}));

describe('PythonProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call the Python script and return the response for callApi', async () => {
    const provider = new PythonProvider('script.py');
    const mockResponse = { output: 'response text' };
    jest.mocked(runPython).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result).toEqual(mockResponse);
    expect(runPython).toHaveBeenCalledWith(
      'script.py',
      'call_api',
      ['test prompt', undefined, undefined],
      expect.anything(),
    );
  });

  it('should call the Python script with custom function and return the response for callApi', async () => {
    const provider = new PythonProvider('script.py:my_function');
    const mockResponse = { output: 'response text' };
    jest.mocked(runPython).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result).toEqual(mockResponse);
    expect(runPython).toHaveBeenCalledWith(
      'script.py',
      'my_function',
      ['test prompt', undefined, undefined],
      expect.anything(),
    );
  });

  it('should call the Python script and return the response for callEmbeddingApi', async () => {
    const provider = new PythonProvider('script.py');
    const mockResponse = { embedding: [0.1, 0.2, 0.3] };
    jest.mocked(runPython).mockResolvedValue(mockResponse);

    const result = await provider.callEmbeddingApi('test prompt');
    expect(result).toEqual(mockResponse);
    expect(runPython).toHaveBeenCalledWith(
      'script.py',
      'call_embedding_api',
      ['test prompt', undefined],
      expect.anything(),
    );
  });

  it('should call the Python script and return the response for callClassificationApi', async () => {
    const provider = new PythonProvider('script.py');
    const mockResponse = { classification: { label: 'positive', score: 0.8 } };
    jest.mocked(runPython).mockResolvedValue(mockResponse);

    const result = await provider.callClassificationApi('test prompt');
    expect(result).toEqual(mockResponse);
    expect(runPython).toHaveBeenCalledWith(
      'script.py',
      'call_classification_api',
      ['test prompt', undefined],
      expect.anything(),
    );
  });

  it('should handle errors from the Python script', async () => {
    const provider = new PythonProvider('script.py');
    const mockError = { error: 'something went wrong' };
    jest.mocked(runPython).mockResolvedValue(mockError);

    const result = await provider.callApi('test prompt');
    expect(result).toEqual(mockError);
  });
});
