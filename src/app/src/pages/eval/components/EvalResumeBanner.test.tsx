import { callApi } from '@app/utils/api';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalResumeBanner from './EvalResumeBanner';
import type { EvaluateStats } from '@promptfoo/types';

vi.mock('@app/constants', () => ({
  IS_RUNNING_LOCALLY: true,
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@app/utils/api');

const fetchEvalData = vi.fn();
vi.mock('./store', () => ({
  useTableStore: () => ({ fetchEvalData }),
}));

const emptyCompletionDetails = {
  reasoning: 0,
  acceptedPrediction: 0,
  rejectedPrediction: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

const stats = (overrides: Partial<EvaluateStats> = {}): EvaluateStats => ({
  successes: 1,
  failures: 0,
  errors: 0,
  tokenUsage: {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: emptyCompletionDetails,
    assertions: {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
      completionDetails: emptyCompletionDetails,
    },
  },
  expectedTestCount: 3,
  status: 'canceled',
  ...overrides,
});

describe('EvalResumeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show a resume prompt while the eval is still running', () => {
    render(<EvalResumeBanner evalId="eval-1" stats={stats({ status: 'running' })} />);

    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Evaluation Incomplete/i)).not.toBeInTheDocument();
  });

  it('starts a resume job for stopped incomplete evals', async () => {
    const user = userEvent.setup();
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { id: 'job-1' } }),
    } as any);

    render(<EvalResumeBanner evalId="eval-1" stats={stats()} />);
    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(callApi).toHaveBeenCalledWith('/eval/eval-1/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });
});
