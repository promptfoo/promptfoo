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

  it('uses an empty config for string plugin entries', async () => {
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: ['policy'],
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

    expect(result.current.testGenerationPlugin).toBe('policy');
    expect(generateTestCase).toHaveBeenCalledWith(
      {
        id: 'policy',
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
