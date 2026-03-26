import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStrategyTestGeneration } from './useStrategyTestGeneration';

const mockGenerateTestCase = vi.fn();
const mockUseRedTeamConfig = vi.fn();
const mockUseTestCaseGeneration = vi.fn();

vi.mock('../../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

vi.mock('../TestCaseGenerationProvider', () => ({
  useTestCaseGeneration: () => mockUseTestCaseGeneration(),
}));

describe('useStrategyTestGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateTestCase.mockReset();
    mockUseRedTeamConfig.mockReset();
    mockUseTestCaseGeneration.mockReset();

    mockUseTestCaseGeneration.mockReturnValue({
      generateTestCase: mockGenerateTestCase,
      isGenerating: false,
      strategy: null,
    });
  });

  it('preserves custom policy config when generating a strategy preview', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        strategies: [],
        plugins: [
          {
            id: 'policy',
            config: {
              policy: {
                id: 'refund-policy',
                name: 'Refund Policy',
                text: 'Do not promise refunds without approval.',
              },
            },
          },
        ],
      },
    });

    const { result } = renderHook(() => useStrategyTestGeneration({ strategyId: 'basic' }));

    await act(async () => {
      await result.current.handleTestCaseGeneration();
    });

    expect(mockGenerateTestCase).toHaveBeenCalledWith(
      {
        id: 'policy',
        config: {
          policy: {
            id: 'refund-policy',
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

  it('falls back to the default plugin when none are configured', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        strategies: [],
        plugins: [],
      },
    });

    const { result } = renderHook(() => useStrategyTestGeneration({ strategyId: 'basic' }));

    await act(async () => {
      await result.current.handleTestCaseGeneration();
    });

    expect(mockGenerateTestCase).toHaveBeenCalledWith(
      {
        id: 'harmful:hate',
        config: {},
        isStatic: true,
      },
      {
        id: 'basic',
        config: {},
        isStatic: false,
      },
    );
  });
});
