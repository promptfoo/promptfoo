import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesTrajectoryGoalSuccess } from '../../src/matchers';

import type { Assertion, GradingConfig } from '../../src/types/index';

describe('matchesTrajectoryGoalSuccess', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the goal, trajectory, and output into the grading prompt', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 0.85, reason: 'Goal achieved' }),
        tokenUsage: { total: 9, prompt: 5, completion: 4 },
      }),
    };

    const grading: GradingConfig = {
      provider,
      rubricPrompt: 'Goal={{ goal }}\nTrajectory={{ trajectory }}\nOutput={{ output }}',
    };

    const result = await matchesTrajectoryGoalSuccess(
      'Resolve the order lookup task',
      '{"stepCount":2}',
      'The order shipped yesterday.',
      grading,
      { orderId: '123' },
    );

    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Goal=Resolve the order lookup task'),
      expect.objectContaining({
        prompt: expect.objectContaining({
          label: 'trajectory:goal-success',
          raw: expect.stringContaining('Trajectory={"stepCount":2}'),
        }),
        vars: expect.objectContaining({
          goal: 'Resolve the order lookup task',
          orderId: '123',
          output: 'The order shipped yesterday.',
          trajectory: '{"stepCount":2}',
        }),
      }),
    );

    expect(result).toEqual({
      pass: true,
      score: 0.85,
      reason: 'Goal achieved',
      tokensUsed: {
        total: 9,
        prompt: 5,
        completion: 4,
        cached: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
        numRequests: 0,
      },
      metadata: {
        renderedGradingPrompt:
          'Goal=Resolve the order lookup task\nTrajectory={"stepCount":2}\nOutput=The order shipped yesterday.',
      },
      assertion: undefined,
    });
  });

  it('applies assertion thresholds to the returned score', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 0.6, reason: 'Partial progress' }),
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }),
    };

    const grading: GradingConfig = {
      provider,
      rubricPrompt: 'Goal={{ goal }}',
    };

    const assertion: Assertion = {
      type: 'trajectory:goal-success',
      threshold: 0.8,
      value: 'Resolve the task',
    };

    const result = await matchesTrajectoryGoalSuccess(
      'Resolve the task',
      '{"stepCount":1}',
      'I found part of the answer.',
      grading,
      {},
      assertion,
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0.6,
        reason: 'Partial progress',
      }),
    );
  });
});
