import { mockCallApiResponse, mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
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
    resetCallApiMock();
  });

  it('does not show a resume prompt while the eval is still running', () => {
    render(<EvalResumeBanner evalId="eval-1" stats={stats({ status: 'running' })} />);

    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Evaluation Incomplete/i)).not.toBeInTheDocument();
  });

  it('hides the resume prompt when eval stats are absent, complete, or already fully counted', () => {
    const { rerender } = render(<EvalResumeBanner evalId="eval-1" stats={null} />);

    expect(screen.queryByText(/Evaluation Incomplete/i)).not.toBeInTheDocument();

    rerender(<EvalResumeBanner evalId="eval-1" stats={stats({ status: 'complete' })} />);
    expect(screen.queryByText(/Evaluation Incomplete/i)).not.toBeInTheDocument();

    rerender(<EvalResumeBanner evalId="eval-1" stats={stats({ expectedTestCount: undefined })} />);
    expect(screen.queryByText(/Evaluation Incomplete/i)).not.toBeInTheDocument();

    rerender(
      <EvalResumeBanner
        evalId="eval-1"
        stats={stats({ successes: 1, failures: 1, errors: 1, expectedTestCount: 3 })}
      />,
    );
    expect(screen.queryByText(/Evaluation Incomplete/i)).not.toBeInTheDocument();
  });

  it('dismisses the resume prompt', async () => {
    const user = userEvent.setup();

    render(<EvalResumeBanner evalId="eval-1" stats={stats()} />);
    expect(screen.getByText(/Evaluation Incomplete/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/Evaluation Incomplete/i)).not.toBeInTheDocument();
  });

  it('starts a resume job for stopped incomplete evals', async () => {
    const user = userEvent.setup();
    mockCallApiResponse({ data: { id: 'job-1' } });

    render(<EvalResumeBanner evalId="eval-1" stats={stats()} />);
    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(callApi).toHaveBeenCalledWith('/eval/eval-1/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('shows progress while polling and refreshes eval data when the resume job completes', async () => {
    const user = userEvent.setup();
    mockCallApiRoutes([
      {
        method: 'POST',
        path: '/eval/eval-1/resume',
        response: { id: 'job-1' },
      },
      {
        path: '/eval/job/job-1',
        response: { status: 'running', progress: 1, total: 3 },
      },
      {
        path: '/eval/job/job-1',
        response: { status: 'complete' },
      },
    ]);

    render(<EvalResumeBanner evalId="eval-1" stats={stats()} />);
    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(await screen.findByText('Resuming...')).toBeInTheDocument();

    expect(await screen.findByText('Resuming... (1/3)', {}, { timeout: 2000 })).toBeInTheDocument();

    await waitFor(() => expect(fetchEvalData).toHaveBeenCalledWith('eval-1'), { timeout: 2000 });
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  it('stops resuming when the resume request fails', async () => {
    const user = userEvent.setup();
    mockCallApiRoutes([
      {
        method: 'POST',
        path: '/eval/eval-1/resume',
        ok: false,
        response: { error: 'nope' },
      },
    ]);

    render(<EvalResumeBanner evalId="eval-1" stats={stats()} />);
    await user.click(screen.getByRole('button', { name: /resume/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument(),
    );
  });

  it('stops polling when the resume job returns an error', async () => {
    const user = userEvent.setup();
    mockCallApiRoutes([
      {
        method: 'POST',
        path: '/eval/eval-1/resume',
        response: { data: { id: 'job-1' } },
      },
      {
        path: '/eval/job/job-1',
        response: { status: 'error' },
      },
    ]);

    render(<EvalResumeBanner evalId="eval-1" stats={stats()} />);
    await user.click(screen.getByRole('button', { name: /resume/i }));

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
        expect(fetchEvalData).not.toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });
});
