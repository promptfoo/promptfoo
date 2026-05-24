import type { ComponentProps } from 'react';

import { ToastContext } from '@app/contexts/ToastContextDef';
import { addEvalAssertions, getAssertionJobStatus } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddAssertionsDialog from './AddAssertionsDialog';

// Mock APIs needed for Radix Select
HTMLElement.prototype.hasPointerCapture = vi.fn();
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock('@app/utils/api', () => ({
  addEvalAssertions: vi.fn(),
  getAssertionJobStatus: vi.fn(),
}));

const renderDialog = (props: ComponentProps<typeof AddAssertionsDialog>) => {
  return render(
    <ToastContext.Provider value={{ showToast: vi.fn() }}>
      <AddAssertionsDialog {...props} />
    </ToastContext.Provider>,
  );
};

describe('AddAssertionsDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnApplied = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(addEvalAssertions).mockResolvedValue({
      data: { jobId: null, updatedResults: 1, skippedResults: 0, skippedAssertions: 0 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('submits assertions for a single result scope', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-1',
      availableScopes: ['results'],
      defaultScope: 'results',
      resultId: 'result-1',
      onApplied: mockOnApplied,
    });

    // Click "Contains text" quick action
    await user.click(screen.getByText('Contains text'));

    // Fill in the value (find by placeholder)
    await user.type(screen.getByPlaceholderText('Text to search for...'), 'denver');

    // Submit - button text is now "Run X on Y →"
    await user.click(screen.getByRole('button', { name: /Run 1 on 1/ }));

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenCalledWith('eval-1', {
        assertions: [{ type: 'icontains', value: 'denver' }],
        scope: { type: 'results', resultIds: ['result-1'] },
      });
    });

    expect(mockOnApplied).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('switches scope to test case and submits with test indices', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-2',
      availableScopes: ['results', 'tests'],
      defaultScope: 'results',
      resultId: 'result-2',
      testIndex: 3,
      onApplied: mockOnApplied,
    });

    // Switch scope
    await user.click(screen.getByRole('combobox'));
    const testScopeOption = await screen.findByRole('option', {
      name: 'All prompts in this test case',
    });
    await user.click(testScopeOption);

    // Click "Contains text" quick action
    await user.click(screen.getByText('Contains text'));

    // Fill in the value
    await user.type(screen.getByPlaceholderText('Text to search for...'), 'sacramento');

    // Submit
    await user.click(screen.getByRole('button', { name: /Run 1 on 1/ }));

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenCalledWith('eval-2', {
        assertions: [{ type: 'icontains', value: 'sacramento' }],
        scope: { type: 'tests', testIndices: [3] },
      });
    });
  });

  it('disables submit when assertion value is empty', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-3',
      availableScopes: ['results'],
      defaultScope: 'results',
      resultId: 'result-3',
      onApplied: mockOnApplied,
    });

    // Click "Contains text" quick action (requires a value)
    await user.click(screen.getByText('Contains text'));

    // Submit button should be disabled because value is empty
    // Button text is still "Run 1 on 1 →" but it's disabled
    const submitButton = screen.getByRole('button', { name: /Run 1 on 1/ });
    expect(submitButton).toBeDisabled();

    // Type a value
    await user.type(screen.getByPlaceholderText('Text to search for...'), 'test');

    // Submit button should now be enabled
    expect(submitButton).toBeEnabled();
  });

  it('allows submission for assertion types that do not require values', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-4',
      availableScopes: ['results'],
      defaultScope: 'results',
      resultId: 'result-4',
      onApplied: mockOnApplied,
    });

    // Click "Is valid JSON" quick action (does not require a value)
    await user.click(screen.getByText('Is valid JSON'));

    // Submit button should be enabled even without a value
    const submitButton = screen.getByRole('button', { name: /Run 1 on 1/ });
    expect(submitButton).toBeEnabled();

    // Submit
    await user.click(submitButton);

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenCalledWith('eval-4', {
        assertions: [{ type: 'is-json', value: '' }],
        scope: { type: 'results', resultIds: ['result-4'] },
      });
    });
  });

  it('allows threshold-only assertions to submit with a threshold and no value', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-latency',
      availableScopes: ['results'],
      defaultScope: 'results',
      resultId: 'result-latency',
      onApplied: mockOnApplied,
    });

    await user.click(screen.getByText(/Browse all/));
    await user.type(screen.getByPlaceholderText('Search assertion types...'), 'latency');
    await user.click(screen.getByRole('button', { name: /latency/i }));

    const submitButton = screen.getByRole('button', { name: /Run 1 on 1/ });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Threshold'), '250');
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenCalledWith('eval-latency', {
        assertions: [{ type: 'latency', value: '', threshold: 250 }],
        scope: { type: 'results', resultIds: ['result-latency'] },
      });
    });
  });

  it('requires a prompt for PI assertions before submitting', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-pi',
      availableScopes: ['results'],
      defaultScope: 'results',
      resultId: 'result-pi',
      onApplied: mockOnApplied,
    });

    await user.click(screen.getByText(/Browse all/));
    await user.type(screen.getByPlaceholderText('Search assertion types...'), 'pi');
    await user.click(screen.getByRole('button', { name: /^pi LLM Checks/i }));

    const submitButton = screen.getByRole('button', { name: /Run 1 on 1/ });
    expect(submitButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText('Describe your evaluation criteria...'),
      'The output must not disclose personal information.',
    );
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenCalledWith('eval-pi', {
        assertions: [
          {
            type: 'pi',
            value: 'The output must not disclose personal information.',
          },
        ],
        scope: { type: 'results', resultIds: ['result-pi'] },
      });
    });
  });

  describe('handleSubmit', () => {
    it('constructs filtered scope payload correctly', async () => {
      const user = userEvent.setup();

      vi.mocked(addEvalAssertions).mockResolvedValue({
        data: { jobId: null, updatedResults: 5, skippedResults: 0, skippedAssertions: 0 },
      });

      renderDialog({
        open: true,
        onClose: mockOnClose,
        evalId: 'eval-filtered',
        availableScopes: ['filtered'],
        defaultScope: 'filtered',
        filters: [
          {
            id: 'filter-1',
            type: 'metric',
            operator: 'eq',
            value: 'failed',
            logicOperator: 'and',
            sortIndex: 0,
          },
        ],
        filterMode: 'all',
        searchText: 'error',
        filteredCount: 5,
        onApplied: mockOnApplied,
      });

      await user.click(screen.getByText('Contains text'));
      await user.type(screen.getByPlaceholderText('Text to search for...'), 'debug');
      // For filtered scope with 5 test cases, button shows "Run 1 on 5 →"
      await user.click(screen.getByRole('button', { name: /Run 1 on 5/ }));

      await waitFor(() => {
        expect(addEvalAssertions).toHaveBeenCalled();
      });

      // Check that the call included filtered scope
      const callArgs = vi.mocked(addEvalAssertions).mock.calls[0];
      expect(callArgs[0]).toBe('eval-filtered');
      expect(callArgs[1].scope.type).toBe('filtered');
    });

    it('handles immediate completion when no job is created', async () => {
      const user = userEvent.setup();
      const mockShowToast = vi.fn();

      vi.mocked(addEvalAssertions).mockResolvedValue({
        data: {
          jobId: null,
          updatedResults: 0,
          skippedResults: 1,
          skippedAssertions: 2,
        },
      });

      render(
        <ToastContext.Provider value={{ showToast: mockShowToast }}>
          <AddAssertionsDialog
            open={true}
            onClose={mockOnClose}
            evalId="eval-1"
            availableScopes={['results']}
            defaultScope="results"
            resultId="result-1"
            onApplied={mockOnApplied}
          />
        </ToastContext.Provider>,
      );

      await user.click(screen.getByText('Contains text'));
      await user.type(screen.getByPlaceholderText('Text to search for...'), 'test');
      await user.click(screen.getByRole('button', { name: /Run 1 on 1/ }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Added assertions to 0 results (1 skipped), 2 duplicate assertions skipped.',
          'warning',
        );
        expect(mockOnApplied).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  it('shows target count in submit button based on scope', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-5',
      availableScopes: ['filtered'],
      defaultScope: 'filtered',
      filteredCount: 100,
      onApplied: mockOnApplied,
    });

    // Add an assertion
    await user.click(screen.getByText('Is valid JSON'));

    // Button should show "Run 1 on 100 →" for filtered scope with 100 test cases
    expect(screen.getByRole('button', { name: /Run 1 on 100/ })).toBeInTheDocument();
  });

  it('shows large filtered run confirmation details before submitting', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-confirm',
      availableScopes: ['filtered'],
      defaultScope: 'filtered',
      filteredCount: 150,
      filters: [
        {
          id: 'filter-1',
          type: 'metric',
          operator: 'eq',
          value: 'failed',
          logicOperator: 'and',
          sortIndex: 0,
        },
        {
          id: 'filter-2',
          type: 'metric',
          operator: 'lt',
          value: '0.5',
          logicOperator: 'and',
          sortIndex: 1,
        },
      ],
      searchText: 'timeout',
      promptCount: 2,
      onApplied: mockOnApplied,
    });

    await user.click(screen.getByText('LLM evaluates'));
    await user.type(
      screen.getByPlaceholderText('Describe what makes a good response...'),
      'helpful',
    );
    await user.click(screen.getByText('Semantically similar'));
    await user.type(
      screen.getByPlaceholderText('Expected output to compare against...'),
      'reference answer',
    );
    await user.click(screen.getByRole('button', { name: /Run 2 on 150/ }));

    expect(screen.getByText('Confirm large assertion run')).toBeInTheDocument();
    expect(screen.getByText(/2 assertions/)).toBeInTheDocument();
    expect(screen.getByText(/150 test cases/)).toBeInTheDocument();
    expect(screen.getAllByText(/300 outputs/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Active: 2 filters, search: "timeout"/)).toBeInTheDocument();
    expect(screen.getByText(/Search: "timeout"/)).toBeInTheDocument();
    expect(screen.getByText(/2 LLM assertions × 300 outputs =/)).toBeInTheDocument();
    expect(screen.getByText(/at least 600 model requests/)).toBeInTheDocument();
    expect(screen.getByText(/each output is scored separately/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByText('Confirm large assertion run')).not.toBeInTheDocument();
    expect(addEvalAssertions).not.toHaveBeenCalled();
  });

  it('confirms filtered runs when model request count exceeds the threshold', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-model-confirm',
      availableScopes: ['filtered'],
      defaultScope: 'filtered',
      filteredCount: 60,
      promptCount: 1,
      onApplied: mockOnApplied,
    });

    await user.click(screen.getByText('LLM evaluates'));
    await user.type(
      screen.getByPlaceholderText('Describe what makes a good response...'),
      'helpful',
    );
    await user.click(screen.getByText('Semantically similar'));
    await user.type(
      screen.getByPlaceholderText('Expected output to compare against...'),
      'reference answer',
    );

    await user.click(screen.getByRole('button', { name: /Run 2 on 60/ }));

    expect(screen.getByText('Confirm large assertion run')).toBeInTheDocument();
    expect(screen.getByText(/2 LLM assertions × 60 outputs =/)).toBeInTheDocument();
    expect(screen.getByText(/at least 120 model requests/)).toBeInTheDocument();
    expect(addEvalAssertions).not.toHaveBeenCalled();
  });

  it('shows async job progress with completed pass and fail counts', async () => {
    const user = userEvent.setup();

    vi.mocked(addEvalAssertions).mockResolvedValue({
      data: { jobId: 'job-progress', total: 2, matchedTestCount: 1 },
    });
    vi.mocked(getAssertionJobStatus).mockResolvedValue({
      data: {
        status: 'in-progress',
        progress: 1,
        total: 2,
        completedResults: [
          { resultId: 'result-pass', pass: true, score: 1 },
          { resultId: 'result-fail', pass: false, score: 0, error: 'Mismatch' },
        ],
        updatedResults: 0,
        skippedResults: 0,
        skippedAssertions: 0,
        errors: [],
        matchedTestCount: 1,
      },
    });

    renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-progress',
      availableScopes: ['results'],
      defaultScope: 'results',
      resultId: 'result-progress',
      onApplied: mockOnApplied,
    });

    await user.click(screen.getByText('Contains text'));
    await user.type(screen.getByPlaceholderText('Text to search for...'), 'progress');
    await user.click(screen.getByRole('button', { name: /Run 1 on 1/ }));

    await waitFor(() => {
      expect(getAssertionJobStatus).toHaveBeenCalledWith('eval-progress', 'job-progress');
    });

    expect(screen.getByText(/Running icontains/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2 outputs/)).toBeInTheDocument();
    expect(screen.getByText('1 passed')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
  });

  it('waits for each job response before scheduling another poll', async () => {
    const user = userEvent.setup();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    let resolveStatus!: (status: Awaited<ReturnType<typeof getAssertionJobStatus>>) => void;
    const pendingStatus = new Promise<Awaited<ReturnType<typeof getAssertionJobStatus>>>(
      (resolve) => {
        resolveStatus = resolve;
      },
    );

    vi.mocked(addEvalAssertions).mockResolvedValue({
      data: { jobId: 'job-serial', total: 1 },
    });
    vi.mocked(getAssertionJobStatus).mockReturnValue(pendingStatus);

    const { unmount } = renderDialog({
      open: true,
      onClose: mockOnClose,
      evalId: 'eval-serial',
      availableScopes: ['results'],
      defaultScope: 'results',
      resultId: 'result-serial',
      onApplied: mockOnApplied,
    });

    await user.click(screen.getByText('Contains text'));
    await user.type(screen.getByPlaceholderText('Text to search for...'), 'serial');
    await user.click(screen.getByRole('button', { name: /Run 1 on 1/ }));

    await waitFor(() => {
      expect(getAssertionJobStatus).toHaveBeenCalledTimes(1);
    });
    expect(setIntervalSpy).not.toHaveBeenCalledWith(expect.any(Function), 500);

    resolveStatus({
      data: {
        status: 'in-progress',
        progress: 0,
        total: 1,
        completedResults: [],
        updatedResults: 0,
        skippedResults: 0,
        skippedAssertions: 0,
        errors: [],
      },
    });
    await waitFor(() => {
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
    });

    unmount();
  });

  it('shows completed job errors and retries the failed result ids', async () => {
    const user = userEvent.setup();
    const mockShowToast = vi.fn();

    vi.mocked(addEvalAssertions)
      .mockResolvedValueOnce({
        data: { jobId: 'job-errors', total: 3 },
      })
      .mockResolvedValueOnce({
        data: { jobId: null, updatedResults: 2, skippedResults: 0, skippedAssertions: 0 },
      });
    vi.mocked(getAssertionJobStatus).mockResolvedValueOnce({
      data: {
        status: 'complete',
        progress: 3,
        total: 3,
        completedResults: [
          { resultId: 'result-success', pass: true, score: 1 },
          { resultId: 'result-error-1', pass: false, score: 0, error: 'Provider timeout' },
          { resultId: 'result-error-2', pass: false, score: 0, error: 'Provider timeout' },
        ],
        updatedResults: 1,
        skippedResults: 0,
        skippedAssertions: 0,
        errors: [
          { resultId: 'result-error-1', error: 'Provider timeout' },
          { resultId: 'result-error-2', error: 'Provider timeout' },
        ],
      },
    });

    render(
      <ToastContext.Provider value={{ showToast: mockShowToast }}>
        <AddAssertionsDialog
          open={true}
          onClose={mockOnClose}
          evalId="eval-errors"
          availableScopes={['results']}
          defaultScope="results"
          resultId="result-errors"
          onApplied={mockOnApplied}
        />
      </ToastContext.Provider>,
    );

    await user.click(screen.getByText('Contains text'));
    await user.type(screen.getByPlaceholderText('Text to search for...'), 'retry me');
    await user.click(screen.getByRole('button', { name: /Run 1 on 1/ }));

    expect(await screen.findByText('2 failed')).toBeInTheDocument();

    await user.click(screen.getByText('View error details'));
    expect(await screen.findByText('Provider timeout')).toBeInTheDocument();
    expect(screen.getByText('(2 results)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry 2 failed' }));

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenLastCalledWith('eval-errors', {
        assertions: [{ type: 'icontains', value: 'retry me' }],
        scope: { type: 'results', resultIds: ['result-error-1', 'result-error-2'] },
      });
    });

    expect(mockShowToast).toHaveBeenLastCalledWith(
      'Retry: Added assertions to 2 results.',
      'success',
    );
    expect(mockOnApplied).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });
});
