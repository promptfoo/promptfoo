import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import {
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../../../src/redteam/remoteGeneration';
import { addCompositeTestCases } from '../../../src/redteam/strategies/singleTurnComposite';
import { CONNECTION_BLOCK_HINT } from '../../../src/util/fetch/errors';

import type { TestCase } from '../../../src/types/index';

vi.mock('../../../src/cache');
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('cli-progress');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    level: 'info',
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

describe('singleTurnComposite strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserEmail).mockReturnValue('test@example.com');
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('http://test-url');
    vi.mocked(getRemoteGenerationHeaders).mockImplementation((extra) => ({
      'Content-Type': 'application/json',
      ...extra,
    }));
    vi.mocked(getRemoteGenerationExplicitlyDisabledError).mockImplementation(
      (strategyName) =>
        `${strategyName} requires remote generation, which has been explicitly disabled.`,
    );
  });

  const testCases: TestCase[] = [
    {
      vars: { prompt: 'original prompt' },
      assert: [{ type: 'equals', value: 'expected', metric: 'test-metric' }],
    },
  ];

  it('throws when remote generation is explicitly disabled', async () => {
    vi.mocked(neverGenerateRemote).mockReturnValue(true);

    await expect(addCompositeTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'Composite jailbreak strategy requires remote generation, which has been explicitly disabled.',
    );
  });

  it('generates composite test cases on success', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { modifiedPrompts: ['composed prompt'] },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addCompositeTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    expect(result[0].vars?.prompt).toBe('composed prompt');
    expect(result[0].metadata?.strategyId).toBe('jailbreak:composite');
  });

  it('routes connection failures through describeFetchError (surfaces cause + network hint)', async () => {
    // Regression guard for promptfoo#9679: a dropped connection must log the
    // hidden cause AND the actionable network-block hint, not a bare
    // `TypeError: terminated`. Pins that this call site uses describeFetchError.
    const cause = Object.assign(new Error('other side closed'), {
      name: 'SocketError',
      code: 'UND_ERR_SOCKET',
    });
    const terminated = Object.assign(new TypeError('terminated'), { cause });
    vi.mocked(fetchWithCache).mockRejectedValue(terminated);

    const result = await addCompositeTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    const logged = vi
      .mocked(logger.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(logged).toContain('Cause: SocketError: other side closed');
    expect(logged).toContain(CONNECTION_BLOCK_HINT);
  });
});
