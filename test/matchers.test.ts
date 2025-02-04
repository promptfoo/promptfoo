import {
  cosineSimilarity,
  fromVars,
  loadFromProviderOptions,
  getGradingProvider,
  getAndCheckProvider,
  fail,
  matchesSimilarity,
} from '../src/matchers';
import { getDefaultProviders } from '../src/providers/defaults';

jest.mock('../src/remoteGrading', () => ({
  doRemoteGrading: jest.fn(),
}));
jest.mock('../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));
jest.mock('../src/providers/defaults', () => ({
  getDefaultProviders: jest.fn().mockResolvedValue({
    embeddingProvider: { callEmbeddingApi: jest.fn() } as any,
    gradingProvider: { callApi: jest.fn() } as any,
  } as any),
}));
jest.mock('../src/providers', () => ({
  loadApiProvider: jest.fn().mockResolvedValue({
    id: jest.fn().mockReturnValue('mockProvider'),
    callApi: jest.fn(),
    callEmbeddingApi: jest.fn(),
    callClassificationApi: jest.fn(),
    callSimilarityApi: jest.fn(),
  }),
}));

describe('cosineSimilarity', () => {
  it('should calculate cosine similarity for valid vectors', () => {
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0);
  });

  it('should throw an error for vectors of different lengths', () => {
    const vecA = [1, 0];
    const vecB = [0, 1, 0];
    expect(() => cosineSimilarity(vecA, vecB)).toThrow('Vectors must be of equal length');
  });
});

describe('fromVars', () => {
  it('should convert variables to stringified format', () => {
    const vars = { key1: 'value1', key2: { nested: 'value2' } };
    expect(fromVars(vars)).toEqual({
      key1: 'value1',
      key2: '{"nested":"value2"}',
    });
  });

  it('should handle undefined variables', () => {
    expect(fromVars(undefined)).toEqual({});
  });
});

describe('loadFromProviderOptions', () => {
  it('should load provider from valid options', async () => {
    const providerOptions = { id: 'mockProvider' };
    const provider = await loadFromProviderOptions(providerOptions);
    expect(provider.id()).toBe('mockProvider');
  });

  it('should throw an error for invalid provider options', async () => {
    await expect(loadFromProviderOptions([] as any)).rejects.toThrow(
      'Provider must be an object, but received an array',
    );
  });
});

describe('getGradingProvider', () => {
  it('should load provider by string ID', async () => {
    const provider = await getGradingProvider('text', 'mockProvider', null);
    expect(provider?.id()).toBe('mockProvider');
  });

  it('should return default provider if no provider is specified', async () => {
    const defaultProvider = { id: jest.fn().mockReturnValue('defaultProvider') } as any;
    const provider = await getGradingProvider('text', undefined, defaultProvider);
    expect(provider?.id()).toBe('defaultProvider');
  });
});

describe('getAndCheckProvider', () => {
  it('should return a valid provider for the specified type', async () => {
    const provider = await getAndCheckProvider('embedding', 'mockProvider', null, 'testCheck');
    expect(provider?.id()).toBe('mockProvider');
  });

  it('should throw an error for invalid provider type', async () => {
    const invalidProvider = { id: jest.fn().mockReturnValue('invalidProvider') } as any;
    await expect(
      getAndCheckProvider('classification', invalidProvider, null, 'testCheck'),
    ).rejects.toThrow('Provider invalidProvider is not a valid classification provider for');
  });
});

describe('fail', () => {
  it('should construct a failure result', () => {
    const result = fail('Test failure reason', { total: 10 });
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Test failure reason',
      tokensUsed: {
        total: 10,
        prompt: 0,
        completion: 0,
        cached: 0,
        completionDetails: undefined,
      },
    });
  });
});

describe('matchesSimilarity', () => {
  beforeEach(() => {
    jest.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: {
        callEmbeddingApi: jest.fn(async (text: string) => {
          if (text === 'Expected output' || text === 'Sample output') {
            return {
              embedding: [1, 0, 0],
              tokenUsage: { total: 5, prompt: 2, completion: 3 },
            };
          } else if (text === 'Different output') {
            return {
              embedding: [0, 1, 0],
              tokenUsage: { total: 5, prompt: 2, completion: 3 },
            };
          }
          throw new Error('Unexpected input');
        }),
      } as any,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when similarity is above the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;

    await expect(matchesSimilarity(expected, output, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Similarity 1.00 is greater than threshold 0.5',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });

  it('should fail when similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    await expect(matchesSimilarity(expected, output, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Similarity 0.00 is less than threshold 0.9',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });
});
