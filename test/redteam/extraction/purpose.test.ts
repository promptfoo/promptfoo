import { fetchWithCache } from '../../../src/cache';
import { extractSystemPurpose } from '../../../src/redteam/extraction/purpose';

jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('System Purpose Extractor', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { task: 'purpose', result: 'Remote extracted purpose' },
      cached: false,
    });

    const result = await extractSystemPurpose(['prompt1', 'prompt2']);
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
});
