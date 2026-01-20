import type { ComponentProps } from 'react';

import { ToastContext } from '@app/contexts/ToastContextDef';
import { addEvalAssertions } from '@app/utils/api';
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
});
