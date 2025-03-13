import Replicate from 'replicate';
import { disableCache, enableCache, isCacheEnabled } from '../../src/cache';
import {
  DefaultModerationProvider,
  ReplicateProvider,
  ReplicateModerationProvider,
  ReplicateImageProvider,
} from '../../src/providers/replicate';

jest.mock('replicate');
jest.mock('../../src/cache');

const MockedReplicate = jest.mocked(Replicate, { shallow: false });

describe('ReplicateProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  it('should handle successful API calls', async () => {
    const mockRun = jest.fn().mockResolvedValue(['test response']);
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('test response');
    expect(mockRun).toHaveBeenCalledWith('test-model', {
      input: expect.any(Object),
    });
  });

  it('should handle API errors', async () => {
    const mockRun = jest.fn().mockRejectedValue(new Error('API Error'));
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API call error: Error: API Error');
  });

  it('should handle prompt prefix and suffix', async () => {
    const mockRun = jest.fn().mockResolvedValue(['test response']);
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateProvider('test-model', {
      config: {
        apiKey: mockApiKey,
        prompt: {
          prefix: 'prefix_',
          suffix: '_suffix',
        },
      },
    });

    await provider.callApi('test');
    expect(mockRun).toHaveBeenCalledWith('test-model', {
      input: expect.objectContaining({
        prompt: 'prefix_test_suffix',
      }),
    });
  });
});

describe('ReplicateModerationProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  it('should handle safe content correctly', async () => {
    const mockRun = jest.fn().mockResolvedValue('safe\n');
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('safe prompt', 'safe response');
    expect(result.flags).toEqual([]);
    expect(mockRun).toHaveBeenCalledWith('test-model', {
      input: {
        prompt: 'safe prompt',
        assistant: 'safe response',
      },
    });
  });

  it('should handle unsafe content with multiple flags', async () => {
    const mockRun = jest.fn().mockResolvedValue('unsafe\nS1,S2,S3');
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('unsafe prompt', 'unsafe response');
    expect(result.flags).toEqual([
      { code: 'S1', description: 'Violent Crimes (S1)', confidence: 1 },
      { code: 'S2', description: 'Non-Violent Crimes (S2)', confidence: 1 },
      { code: 'S3', description: 'Sex Crimes (S3)', confidence: 1 },
    ]);
  });

  it('should handle all possible LLAMAGUARD codes', async () => {
    const mockRun = jest
      .fn()
      .mockResolvedValue('unsafe\nS1,S2,S3,S4,S5,S6,S7,S8,S9,S10,S11,S12,S13');
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('test prompt', 'test response');
    expect(result.flags).toHaveLength(13);
    expect(result.flags).toContainEqual({
      code: 'S4',
      description: 'Child Exploitation (S4)',
      confidence: 1,
    });
    expect(result.flags).toContainEqual({
      code: 'S5',
      description: 'Defamation (S5)',
      confidence: 1,
    });
    expect(result.flags).toContainEqual({
      code: 'S13',
      description: 'Elections (S13)',
      confidence: 1,
    });
  });

  it('should handle API errors gracefully', async () => {
    const mockError = new Error('API Error');
    const mockRun = jest.fn().mockRejectedValue(mockError);
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('test prompt', 'test response');
    expect(result.error).toBe('API call error: Error: API Error');
  });

  it('should handle malformed API responses', async () => {
    const mockRun = jest.fn().mockResolvedValue(undefined);
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('test prompt', 'test response');
    expect(result.error).toBe(
      'API response error: Error: API response error: no output: undefined',
    );
  });

  it('should require API key', async () => {
    const provider = new ReplicateModerationProvider('test-model');
    await expect(provider.callModerationApi('test', 'test')).rejects.toThrow(
      'Replicate API key is not set',
    );
  });

  it('should bypass cache when disabled', async () => {
    const mockRun = jest.fn().mockResolvedValue('unsafe\nS1');
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    disableCache();
    jest.mocked(isCacheEnabled).mockReturnValue(false);

    await provider.callModerationApi('test prompt', 'test response');
    await provider.callModerationApi('test prompt', 'test response');
    expect(mockRun).toHaveBeenCalledTimes(2);
  });
});

describe('ReplicateImageProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  it('should handle successful image generation', async () => {
    const mockImageUrl = 'https://example.com/image.png';
    const mockRun = jest.fn().mockResolvedValue([mockImageUrl]);
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateImageProvider('test-model', {
      config: {
        width: 512,
        height: 512,
      },
      env: {
        REPLICATE_API_KEY: mockApiKey,
      },
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe(`![test prompt](${mockImageUrl})`);
    expect(mockRun).toHaveBeenCalledWith('test-model', {
      input: {
        width: 512,
        height: 512,
        prompt: 'test prompt',
      },
    });
  });

  it('should handle API errors', async () => {
    const mockRun = jest.fn().mockResolvedValue([]);
    MockedReplicate.prototype.run = mockRun;

    const provider = new ReplicateImageProvider('test-model', {
      env: {
        REPLICATE_API_KEY: mockApiKey,
      },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('No image URL found in response: []');
  });
});

describe('DefaultModerationProvider', () => {
  it('should be configured with the correct model', () => {
    expect(DefaultModerationProvider.modelName).toBe(
      'meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8',
    );
  });
});
