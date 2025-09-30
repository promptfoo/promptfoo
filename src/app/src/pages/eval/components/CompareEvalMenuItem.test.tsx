import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import CompareEvalMenuItem from './CompareEvalMenuItem';
import { useTableStore } from './store';

vi.mock('./EvalSelectorDialog', () => ({
  default: vi.fn(({ open, onEvalSelected, onClose, focusedEvalId, filterByDatasetId }) => {
    if (!open) {
      return null;
    }
    return (
      <div data-testid="eval-selector-dialog">
        {focusedEvalId !== undefined ? (
          <div data-testid={`focused-eval-id`}>{focusedEvalId}</div>
        ) : null}
        {filterByDatasetId ? (
          <div data-testid="filter-by-dataset-id">
            {filterByDatasetId ? 'Dataset ID Filter Enabled' : 'Dataset ID Filter Disabled'}
          </div>
        ) : null}
        <button onClick={() => onEvalSelected('selected-eval-id-for-comparison')}>
          Select Eval
        </button>
        {onClose && <button onClick={onClose}>Close</button>}
      </div>
    );
  }),
}));

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

describe('CompareEvalMenuItem', () => {
  const mockOnComparisonEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useTableStore as unknown as Mock).mockReturnValue({
      evalId: 'current-eval-id',
    });
  });

  it('should call onComparisonEvalSelected with the selected evalId and close the dialog when an eval is selected', async () => {
    const user = userEvent.setup();
    render(
      <CompareEvalMenuItem
        onComparisonEvalSelected={mockOnComparisonEvalSelected}
        initialEvals={[]}
      />,
    );

    const menuItem = screen.getByText('Compare with another eval');
    await user.click(menuItem);

    const dialog = screen.getByTestId('eval-selector-dialog');
    expect(dialog).toBeInTheDocument();

    const selectButton = screen.getByRole('button', { name: 'Select Eval' });
    await user.click(selectButton);

    expect(mockOnComparisonEvalSelected).toHaveBeenCalledTimes(1);
    expect(mockOnComparisonEvalSelected).toHaveBeenCalledWith('selected-eval-id-for-comparison');

    expect(screen.queryByTestId('eval-selector-dialog')).not.toBeInTheDocument();
  });

  it('should render EvalSelectorDialog with open=true, focusedEvalId set to the current evalId from useTableStore, and filterByDatasetId enabled when the menu item is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CompareEvalMenuItem
        onComparisonEvalSelected={mockOnComparisonEvalSelected}
        initialEvals={[]}
      />,
    );

    const menuItem = screen.getByText('Compare with another eval');
    await user.click(menuItem);

    const dialog = screen.getByTestId('eval-selector-dialog');
    expect(dialog).toBeInTheDocument();

    const focusedEvalId = screen.getByTestId('focused-eval-id');
    expect(focusedEvalId).toHaveTextContent('current-eval-id');

    const filterByDatasetId = screen.getByTestId('filter-by-dataset-id');
    expect(filterByDatasetId).toBeInTheDocument();
  });

  it('should pass filterByDatasetId prop to EvalSelectorDialog', async () => {
    const user = userEvent.setup();
    render(
      <CompareEvalMenuItem
        onComparisonEvalSelected={mockOnComparisonEvalSelected}
        initialEvals={[]}
      />,
    );

    const menuItem = screen.getByText('Compare with another eval');
    await user.click(menuItem);

    const dialog = screen.getByTestId('eval-selector-dialog');
    expect(dialog).toBeInTheDocument();

    const filterByDatasetIdElement = screen.getByTestId('filter-by-dataset-id');
    expect(filterByDatasetIdElement).toHaveTextContent('Dataset ID Filter Enabled');
  });
});
