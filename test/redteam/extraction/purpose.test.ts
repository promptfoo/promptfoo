import { fetchWithCache } from '../../../src/cache';
import { extractSystemPurpose } from '../../../src/redteam/extraction/purpose';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('System Purpose Extractor', () => {
  let provider: ApiProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    provider = {
      callApi: jest
        .fn()
        .mockResolvedValue({ output: '<Purpose>Extracted system purpose</Purpose>' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation when enabled', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { task: 'purpose', result: 'Remote extracted purpose' },
      cached: false,
    });

    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('Remote extracted purpose');
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/v1/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ task: 'purpose', prompts: ['prompt1', 'prompt2'] }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should fall back to local extraction when remote generation fails', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('Remote generation failed'));

    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('Extracted system purpose');
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt1'));
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt2'));
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
    jest.mocked(provider.callApi).mockResolvedValue({ output: 'Extracted system purpose' });

    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('Extracted system purpose');
  });
});
