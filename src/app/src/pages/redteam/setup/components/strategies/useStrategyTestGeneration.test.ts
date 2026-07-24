import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';
import { useStrategyTestGeneration } from './useStrategyTestGeneration';

vi.mock('../../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: vi.fn(),
}));

vi.mock('../TestCaseGenerationProvider', () => ({
  useTestCaseGeneration: vi.fn(),
}));

describe('useStrategyTestGeneration', () => {
  const generateTestCase = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useTestCaseGeneration).mockReturnValue({
      generateTestCase,
      isGenerating: false,
      strategy: null,
      continueGeneration: vi.fn(),
      plugin: null,
    });
  });

  it('passes through configured plugin payloads when generating a strategy preview', async () => {
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'policy',
            config: {
              policy: 'Never disclose another customer account details.',
            },
          },
        ],
        strategies: [
          {
            id: 'jailbreak:meta',
            config: {
              numTests: 5,
            },
          },
        ],
      },
    } as ReturnType<typeof useRedTeamConfig>);

    const { result } = renderHook(() =>
      useStrategyTestGeneration({
        strategyId: 'jailbreak:meta',
      }),
    );

    await act(async () => {
      await result.current.handleTestCaseGeneration();
    });

    expect(result.current.testGenerationPlugin).toBe('policy');
    expect(generateTestCase).toHaveBeenCalledWith(
      {
        id: 'policy',
        config: {
          policy: 'Never disclose another customer account details.',
        },
        isStatic: true,
      },
      {
        id: 'jailbreak:meta',
        config: {
          numTests: 5,
        },
        isStatic: false,
      },
    );
  });

  it('preserves custom policy object config when generating a strategy preview', async () => {
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'policy',
            config: {
              policy: {
                id: 'abcdef123456',
                name: 'Refund Policy',
                text: 'Do not promise refunds without approval.',
              },
            },
          },
        ],
        strategies: [],
      },
    } as ReturnType<typeof useRedTeamConfig>);

    const { result } = renderHook(() =>
      useStrategyTestGeneration({
        strategyId: 'basic',
      }),
    );

    await act(async () => {
      await result.current.handleTestCaseGeneration();
    });

    expect(result.current.testGenerationPlugin).toBe('policy');
    expect(generateTestCase).toHaveBeenCalledWith(
      {
        id: 'policy',
        config: {
          policy: {
            id: 'abcdef123456',
            name: 'Refund Policy',
            text: 'Do not promise refunds without approval.',
          },
        },
        isStatic: true,
      },
      {
        id: 'basic',
        config: {},
        isStatic: false,
      },
    );
  });

  it('falls back to the default preview plugin when no plugins are configured', async () => {
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: [],
        strategies: [],
      },
    } as ReturnType<typeof useRedTeamConfig>);

    const { result } = renderHook(() =>
      useStrategyTestGeneration({
        strategyId: 'jailbreak:meta',
      }),
    );

    await act(async () => {
      await result.current.handleTestCaseGeneration();
    });

    expect(result.current.testGenerationPlugin).toBe('harmful:hate');
    expect(generateTestCase).toHaveBeenCalledWith(
      {
        id: 'harmful:hate',
        config: {},
        isStatic: true,
      },
      {
        id: 'jailbreak:meta',
        config: {},
        isStatic: false,
      },
    );
  });

  it('skips malformed entries before selecting the initial preview plugin', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: [
          '',
          { config: {} } as never,
          { id: 'policy', config: { policy: '' } },
          { id: 'policy', config: { policy: {} } },
          {
            id: 'policy',
            config: {
              policy: {
                id: 'abcdef123456',
                name: 'Valid Policy',
                text: 'Keep this policy active.',
              },
            },
          },
        ],
        strategies: [],
      },
    } as ReturnType<typeof useRedTeamConfig>);

    try {
      const { result } = renderHook(() =>
        useStrategyTestGeneration({
          strategyId: 'jailbreak:meta',
        }),
      );

      await act(async () => {
        await result.current.handleTestCaseGeneration();
      });

      expect(result.current.testGenerationPlugin).toBe('policy');
      expect(generateTestCase).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'policy',
          config: expect.objectContaining({
            policy: expect.objectContaining({ name: 'Valid Policy' }),
          }),
        }),
        expect.any(Object),
      );
    } finally {
      random.mockRestore();
    }
  });

  it('uses the default preview plugin when every saved entry is malformed', async () => {
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: [
          '',
          { config: {} } as never,
          { id: 'policy', config: { policy: '' } },
          { id: 'policy', config: { policy: { id: '', text: '' } } },
        ],
        strategies: [],
      },
    } as ReturnType<typeof useRedTeamConfig>);

    const { result } = renderHook(() =>
      useStrategyTestGeneration({
        strategyId: 'jailbreak:meta',
      }),
    );

    await act(async () => {
      await result.current.handleTestCaseGeneration();
    });

    expect(result.current.testGenerationPlugin).toBe('harmful:hate');
    expect(generateTestCase).toHaveBeenCalledWith(
      { id: 'harmful:hate', config: {}, isStatic: true },
      expect.any(Object),
    );
  });

  it('uses an empty config for string plugin entries', async () => {
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: ['harmful:hate'],
        strategies: [],
      },
    } as ReturnType<typeof useRedTeamConfig>);

    const { result } = renderHook(() =>
      useStrategyTestGeneration({
        strategyId: 'jailbreak:meta',
      }),
    );

    await act(async () => {
      await result.current.handleTestCaseGeneration();
    });

    expect(result.current.testGenerationPlugin).toBe('harmful:hate');
    expect(generateTestCase).toHaveBeenCalledWith(
      {
        id: 'harmful:hate',
        config: {},
        isStatic: true,
      },
      {
        id: 'jailbreak:meta',
        config: {},
        isStatic: false,
      },
    );
  });
});
