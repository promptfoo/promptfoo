import { fetchWithCache } from '../../../src/cache';
import { extractEntities } from '../../../src/redteam/extraction/entities';

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
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
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
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { task: 'entities', result: [] },
      cached: false,
    });

    const result = await extractEntities(['prompt']);

    expect(result).toEqual([]);
  });
});
