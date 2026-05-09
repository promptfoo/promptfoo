import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { VERSION } from '../../../src/constants';
import {
  DEFAULT_PURPOSE,
  extractSystemPurpose,
  extractSystemPurposeWithMetadata,
} from '../../../src/redteam/extraction/purpose';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../factories/provider';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});
vi.mock('../../../src/redteam/remoteGeneration', async () => ({
  ...(await vi.importActual('../../../src/redteam/remoteGeneration')),
  getRemoteGenerationUrl: vi.fn().mockReturnValue('https://api.promptfoo.app/api/v1/task'),
}));

describe('System Purpose Extractor', () => {
  let provider: MockApiProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    mockProcessEnv({ ...originalEnv }, { clear: true });
    mockProcessEnv({ PROMPTFOO_REMOTE_GENERATION_URL: undefined });
    provider = createMockProvider({
      response: createProviderResponse({
        output: '<Purpose>Extracted system purpose</Purpose>',
      }),
    });
    vi.clearAllMocks();
    vi.mocked(getRemoteGenerationUrl).mockImplementation(function () {
      return 'https://api.promptfoo.app/api/v1/task';
    });
  });

  afterEach(() => {
    mockProcessEnv(originalEnv, { clear: true });
  });

  it('should use remote generation when enabled', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    mockProcessEnv({ PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'false' });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { task: 'purpose', result: 'Remote extracted purpose' },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('Remote extracted purpose');
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.app/api/v1/task',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          task: 'purpose',
          prompts: ['prompt1', 'prompt2'],
          version: VERSION,
          email: null,
        }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should preserve remote extraction token usage through the metadata helper', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    mockProcessEnv({ PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'false' });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        task: 'purpose',
        result: 'Remote extracted purpose',
        tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    const result = await extractSystemPurposeWithMetadata(provider, ['prompt1', 'prompt2']);

    expect(result).toEqual({
      result: 'Remote extracted purpose',
      tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
    });
  });

  it('should not fall back to local extraction when remote generation fails', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'false' });
    const originalOpenaiKey = process.env.OPENAI_API_KEY;
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('Remote generation failed'));
    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('');
    expect(provider.callApi).not.toHaveBeenCalled();
    mockProcessEnv({ OPENAI_API_KEY: originalOpenaiKey });
  });

  it('should use local extraction when remote generation is disabled', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'true' });

    const result = await extractSystemPurpose(provider, ['prompt']);

    expect(result).toBe('Extracted system purpose');
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt'));
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should preserve local extraction token usage through the metadata helper', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'true' });
    vi.mocked(provider.callApi).mockResolvedValue({
      output: '<Purpose>Extracted system purpose</Purpose>',
      tokenUsage: { total: 13, prompt: 8, completion: 5 },
    });

    const result = await extractSystemPurposeWithMetadata(provider, ['prompt']);

    expect(result).toEqual({
      result: 'Extracted system purpose',
      tokenUsage: { total: 13, prompt: 8, completion: 5, numRequests: 1 },
    });
  });

  it('should use local extraction when local credentials are available', async () => {
    mockProcessEnv({
      OPENAI_API_KEY: 'sk-local',
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'false',
    });

    const result = await extractSystemPurpose(provider, ['prompt']);

    expect(result).toBe('Extracted system purpose');
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt'));
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should honor an explicit local-extraction override', async () => {
    mockProcessEnv({
      OPENAI_API_KEY: undefined,
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'false',
    });

    const result = await extractSystemPurpose(provider, ['prompt'], { forceLocal: true });

    expect(result).toBe('Extracted system purpose');
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt'));
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should extract system purpose when returned without xml tags', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'true' });
    vi.mocked(provider.callApi).mockResolvedValue({ output: 'Extracted system purpose' });

    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('Extracted system purpose');
  });

  it('should return default message for empty prompts array', async () => {
    const result = await extractSystemPurpose(provider, []);
    expect(result).toBe(DEFAULT_PURPOSE);
  });

  it('should return default message for prompts array with only template variable', async () => {
    const result = await extractSystemPurpose(provider, ['{{prompt}}']);
    expect(result).toBe(DEFAULT_PURPOSE);
  });
});
