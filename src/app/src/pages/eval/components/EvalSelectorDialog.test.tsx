import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import EvalsTable from '../../evals/components/EvalsTable';
import EvalSelectorDialog from './EvalSelectorDialog';

vi.mock('../../evals/components/EvalsTable', () => ({
  default: vi.fn(({ onEvalSelected }: { onEvalSelected: (evalId: string) => void }) => {
    return (
      <div data-testid="mock-evals-table">
        <button data-testid="select-eval" onClick={() => onEvalSelected('test-eval-id')}>
          Select Eval
        </button>
      </div>
    );
  }),
}));

const MockedEvalsTable = EvalsTable as Mock;

describe('EvalSelectorDialog', () => {
  beforeEach(() => {
    MockedEvalsTable.mockClear();
  });

  it('should render the dialog with EvalsTable when open', () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog open={true} onClose={mockOnClose} onEvalSelected={mockOnEvalSelected} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('mock-evals-table')).toBeInTheDocument();
    expect(MockedEvalsTable).toHaveBeenCalledTimes(1);
  });

  it('should call onEvalSelected with the selected evalId when an eval is selected in EvalsTable', async () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog open={true} onClose={mockOnClose} onEvalSelected={mockOnEvalSelected} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByTestId('select-eval'));

    expect(mockOnEvalSelected).toHaveBeenCalledTimes(1);
    expect(mockOnEvalSelected).toHaveBeenCalledWith('test-eval-id');
  });

  it('should pass focusedEvalId and filterByDatasetId to EvalsTable', () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();
    const focusedEvalId = 'test-eval-id';
    const filterByDatasetId = true;

    render(
      <MemoryRouter>
        <EvalSelectorDialog
          open={true}
          onClose={mockOnClose}
          onEvalSelected={mockOnEvalSelected}
          focusedEvalId={focusedEvalId}
          filterByDatasetId={filterByDatasetId}
        />
      </MemoryRouter>,
    );

    expect(MockedEvalsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        focusedEvalId: focusedEvalId,
        filterByDatasetId: filterByDatasetId,
      }),
      undefined,
    );
  });

  it('should handle the case when filterByDatasetId is true but focusedEvalId is undefined', () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog
          open={true}
          onClose={mockOnClose}
          onEvalSelected={mockOnEvalSelected}
          filterByDatasetId={true}
        />
      </MemoryRouter>,
    );

    expect(MockedEvalsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        filterByDatasetId: true,
        focusedEvalId: undefined,
        onEvalSelected: mockOnEvalSelected,
      }),
      undefined,
    );
  });

  it('should display "No evals found" message when EvalsTable has no evals', () => {
    MockedEvalsTable.mockImplementationOnce(() => (
      <div data-testid="mock-evals-table" className="flex flex-col items-center justify-center p-6">
        <div className="text-4xl mb-4">🔍</div>
        <h3 className="text-lg font-semibold">No evals found</h3>
        <p className="text-sm text-muted-foreground">
          Try adjusting your search or create a new evaluation
        </p>
      </div>
    ));

    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog open={true} onClose={mockOnClose} onEvalSelected={mockOnEvalSelected} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No evals found')).toBeInTheDocument();
  });
});
