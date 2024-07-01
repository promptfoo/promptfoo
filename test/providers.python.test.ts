import fs from 'fs';
import path from 'path';
import { getCache, isCacheEnabled } from '../src/cache';
import logger from '../src/logger';
import { PythonProvider } from '../src/providers/pythonCompletion';
import { runPython } from '../src/python/wrapper';
import {
  ProviderResponse,
  ProviderEmbeddingResponse,
  ProviderClassificationResponse,
} from '../src/types';

jest.mock('fs');
jest.mock('path');
jest.mock('../src/cache');
jest.mock('../src/logger');
jest.mock('../src/python/wrapper');

describe('PythonProvider', () => {
  const scriptPath = 'test_script.py';
  const options = {
    id: 'test_id',
    config: { basePath: '/base/path', pythonExecutable: 'python3' },
  };
  const prompt = 'test prompt';
  const context = { someContext: 'value' };
  const fileHash = 'mockedFileHash';
  const cacheKey = `python:${scriptPath}:call_api:${fileHash}:${prompt}:${JSON.stringify(options)}`;
  const absPath = '/base/path/test_script.py';

  let provider: PythonProvider;

  beforeEach(() => {
    provider = new PythonProvider(scriptPath, options);
    (path.resolve as jest.Mock).mockReturnValue(absPath);
    (fs.readFileSync as jest.Mock).mockReturnValue('file content');
    (getCache as jest.Mock).mockResolvedValue({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(null),
    });
    (isCacheEnabled as jest.Mock).mockReturnValue(true);
    (runPython as jest.Mock).mockResolvedValue({ output: 'result' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return cached result if available', async () => {
    const cache = await getCache();
    (cache.get as jest.Mock).mockResolvedValue(JSON.stringify({ output: 'cached result' }));

    const result = await provider.callApi(prompt, context);

    expect(result).toEqual({ output: 'cached result' });
    expect(cache.get).toHaveBeenCalledWith(cacheKey);
    expect(runPython).not.toHaveBeenCalled();
  });

  it('should run the script and cache the result if not cached', async () => {
    const result = await provider.callApi(prompt, context);

    expect(result).toEqual({ output: 'result' });
    expect(runPython).toHaveBeenCalledWith(absPath, 'call_api', [prompt, options, context], {
      pythonExecutable: 'python3',
    });
    const cache = await getCache();
    expect(cache.set).toHaveBeenCalledWith(cacheKey, JSON.stringify({ output: 'result' }));
  });

  it('should handle callEmbeddingApi correctly', async () => {
    (runPython as jest.Mock).mockResolvedValue({ embedding: [1, 2, 3] });

    const result = await provider.callEmbeddingApi(prompt);

    expect(result).toEqual({ embedding: [1, 2, 3] });
    expect(runPython).toHaveBeenCalledWith(absPath, 'call_embedding_api', [prompt, options], {
      pythonExecutable: 'python3',
    });
  });

  it('should handle callClassificationApi correctly', async () => {
    (runPython as jest.Mock).mockResolvedValue({ classification: { label: 'test' } });

    const result = await provider.callClassificationApi(prompt);

    expect(result).toEqual({ classification: { label: 'test' } });
    expect(runPython).toHaveBeenCalledWith(absPath, 'call_classification_api', [prompt, options], {
      pythonExecutable: 'python3',
    });
  });

  it('should throw an error if the script does not return the expected output for callApi', async () => {
    (runPython as jest.Mock).mockResolvedValue({ unexpected: 'value' });

    await expect(provider.callApi(prompt, context)).rejects.toThrow(
      'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: {"unexpected":"value"}',
    );
  });

  it('should throw an error if the script does not return the expected output for callEmbeddingApi', async () => {
    (runPython as jest.Mock).mockResolvedValue({ unexpected: 'value' });

    await expect(provider.callEmbeddingApi(prompt)).rejects.toThrow(
      'The Python script `call_embedding_api` function must return a dict with an `embedding` array or `error` string, instead got {"unexpected":"value"}',
    );
  });

  it('should throw an error if the script does not return the expected output for callClassificationApi', async () => {
    (runPython as jest.Mock).mockResolvedValue({ unexpected: 'value' });

    await expect(provider.callClassificationApi(prompt)).rejects.toThrow(
      'The Python script `call_classification_api` function must return a dict with a `classification` object or `error` string, instead of {"unexpected":"value"}',
    );
  });
});
