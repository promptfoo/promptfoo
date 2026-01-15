import type { ComponentProps } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContext } from '@app/contexts/ToastContextDef';
import { addEvalAssertions } from '@app/utils/api';
import AddAssertionsDialog from './AddAssertionsDialog';

// Mock APIs needed for Radix Select
HTMLElement.prototype.hasPointerCapture = vi.fn();
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock('@app/utils/api', () => ({
  addEvalAssertions: vi.fn(),
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
      data: { updatedResults: 1, skippedResults: 0, skippedAssertions: 0 },
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

    await user.click(screen.getByRole('button', { name: 'Add Assertion' }));
    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'denver');
    await user.click(screen.getByRole('button', { name: 'Add assertions' }));

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenCalledWith('eval-1', {
        assertions: [{ type: 'equals', value: 'denver' }],
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

    await user.click(screen.getByRole('combobox'));
    const testScopeOption = await screen.findByRole('option', {
      name: 'All prompts in this test case',
    });
    await user.click(testScopeOption);

    await user.click(screen.getByRole('button', { name: 'Add Assertion' }));
    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'sacramento');
    await user.click(screen.getByRole('button', { name: 'Add assertions' }));

    await waitFor(() => {
      expect(addEvalAssertions).toHaveBeenCalledWith('eval-2', {
        assertions: [{ type: 'equals', value: 'sacramento' }],
        scope: { type: 'tests', testIndices: [3] },
      });
    });
  });
});
