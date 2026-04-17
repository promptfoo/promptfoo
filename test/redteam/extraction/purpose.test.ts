import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { VERSION } from '../../../src/constants';
import { DEFAULT_PURPOSE, extractSystemPurpose } from '../../../src/redteam/extraction/purpose';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';

import type { ApiProvider } from '../../../src/types/index';

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
  let provider: ApiProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
    provider = {
      callApi: vi.fn().mockResolvedValue({ output: '<Purpose>Extracted system purpose</Purpose>' }),
      id: vi.fn().mockReturnValue('test-provider'),
    };
    vi.clearAllMocks();
    vi.mocked(getRemoteGenerationUrl).mockImplementation(function () {
      return 'https://api.promptfoo.app/api/v1/task';
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation when enabled', async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
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

  it('should not fall back to local extraction when remote generation fails', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    const originalOpenaiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = undefined;
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('Remote generation failed'));
    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('');
    expect(provider.callApi).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = originalOpenaiKey;
  });

  it('should use local extraction when remote generation is disabled', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    const result = await extractSystemPurpose(provider, ['prompt']);

    expect(result).toBe('Extracted system purpose');
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt'));
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should extract system purpose when returned without xml tags', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
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
