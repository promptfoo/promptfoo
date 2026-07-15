import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../../../src/redteam/remoteGeneration';
import { addCompositeTestCases } from '../../../src/redteam/strategies/singleTurnComposite';

vi.mock('../../../src/cache');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('cli-progress');

describe('composite strategy generation usage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('http://test-url');
    vi.mocked(getRemoteGenerationHeaders).mockReturnValue({
      'Content-Type': 'application/json',
    });
    vi.mocked(getRemoteGenerationExplicitlyDisabledError).mockImplementation(
      (strategyName) => `${strategyName} requires remote generation.`,
    );
  });

  it('reports usage from remote composite generation', async () => {
    const trackGenerationTokenUsage = vi.fn();
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        modifiedPrompts: ['modified prompt'],
        tokenUsage: { total: 14, prompt: 9, completion: 5, numRequests: 1 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addCompositeTestCases([{ vars: { prompt: 'test' } }], 'prompt', {
      __trackGenerationTokenUsage: trackGenerationTokenUsage,
    });

    expect(result).toHaveLength(1);
    expect(trackGenerationTokenUsage).toHaveBeenCalledWith({
      tokenUsage: { total: 14, prompt: 9, completion: 5, numRequests: 1 },
      cached: false,
    });
  });
});
