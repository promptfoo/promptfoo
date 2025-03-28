import { fetchWithCache } from '../../../src/cache';
import { VERSION } from '../../../src/constants';
import { extractSystemPurpose } from '../../../src/redteam/extraction/purpose';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));
jest.mock('../../../src/redteam/remoteGeneration', () => ({
  ...jest.requireActual('../../../src/redteam/remoteGeneration'),
  getRemoteGenerationUrl: jest.fn().mockReturnValue('https://api.promptfoo.app/task'),
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
      callApi: jest
        .fn()
        .mockResolvedValue({ output: '<Purpose>Extracted system purpose</Purpose>' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.clearAllMocks();
    jest.mocked(getRemoteGenerationUrl).mockReturnValue('https://api.promptfoo.app/task');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation when enabled', async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { task: 'purpose', result: 'Remote extracted purpose' },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('Remote extracted purpose');
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.app/task',
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
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('Remote generation failed'));
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
    jest.mocked(provider.callApi).mockResolvedValue({ output: 'Extracted system purpose' });

    const result = await extractSystemPurpose(provider, ['prompt1', 'prompt2']);

    expect(result).toBe('Extracted system purpose');
  });
});
