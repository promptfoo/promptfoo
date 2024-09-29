import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { extractEntities } from '../../../src/redteam/extraction/entities';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../../src/envars', () => {
  const originalModule = jest.requireActual('../../../src/envars');
  return {
    ...originalModule,
    getEnvBool: jest.fn(originalModule.getEnvBool),
  };
});

describe('Entities Extractor', () => {
  let provider: ApiProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
    provider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Entity: Apple\nEntity: Google' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation when enabled', async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { task: 'entities', result: ['Apple', 'Google'] },
      cached: false,
    });

    const result = await extractEntities(provider, ['prompt1', 'prompt2']);

    expect(result).toEqual(['Apple', 'Google']);
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/v1/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ task: 'entities', prompts: ['prompt1', 'prompt2'] }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should fall back to local extraction when remote generation fails', async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('Remote generation failed'));

    const result = await extractEntities(provider, ['prompt1', 'prompt2']);

    expect(result).toEqual(['Apple', 'Google']);
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt1'));
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt2'));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error using remote generation'),
    );
  });

  it('should use local extraction when remote generation is disabled', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    const result = await extractEntities(provider, ['prompt']);

    expect(result).toEqual(['Apple', 'Google']);
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt'));
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should log debug message when no entities are found', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
    jest.mocked(provider.callApi).mockResolvedValue({ output: 'No entities found' });

    const result = await extractEntities(provider, ['prompt']);

    expect(result).toEqual([]);
  });
});
