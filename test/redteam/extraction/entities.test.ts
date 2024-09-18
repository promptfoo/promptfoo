import { fetchWithCache } from '../../../src/cache';
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

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    provider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Entity: Apple\nEntity: Google' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { task: 'entities', result: ['Apple', 'Google'] },
      cached: false,
    });

    const result = await extractEntities(['prompt1', 'prompt2']);

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

  it('should log debug message when no entities are found', async () => {
    jest.mocked(provider.callApi).mockResolvedValue({ output: 'No entities found' });

    const result = await extractEntities(['prompt']);

    expect(result).toEqual([]);
  });
});
