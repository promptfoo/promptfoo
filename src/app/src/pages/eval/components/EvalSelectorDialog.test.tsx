import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Box, Typography } from '@mui/material';

import EvalsDataGrid from '../../evals/components/EvalsDataGrid';
import EvalSelectorDialog from './EvalSelectorDialog';

vi.mock('../../evals/components/EvalsDataGrid', () => ({
  default: vi.fn(({ onEvalSelected }: { onEvalSelected: (evalId: string) => void }) => {
    return (
      <div data-testid="mock-evals-data-grid">
        <button data-testid="select-eval" onClick={() => onEvalSelected('test-eval-id')}>
          Select Eval
        </button>
      </div>
    );
  }),
}));

const MockedEvalsDataGrid = EvalsDataGrid as Mock;

describe('EvalSelectorDialog', () => {
  beforeEach(() => {
    MockedEvalsDataGrid.mockClear();
  });

  it('should render the dialog with title, description, and EvalsDataGrid when open', () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();
    const title = 'Select an Eval';
    const description = 'Please choose an evaluation from the list below.';

    render(
      <MemoryRouter>
        <EvalSelectorDialog
          open={true}
          onClose={mockOnClose}
          onEvalSelected={mockOnEvalSelected}
          title={title}
          description={description}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    expect(screen.getByText(title)).toBeInTheDocument();

    expect(screen.getByText(description)).toBeInTheDocument();

    expect(screen.getByTestId('mock-evals-data-grid')).toBeInTheDocument();
    expect(MockedEvalsDataGrid).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('should call onClose when the Cancel button is clicked', () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog open={true} onClose={mockOnClose} onEvalSelected={mockOnEvalSelected} />
      </MemoryRouter>,
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onEvalSelected with the selected evalId when an eval is selected in EvalsDataGrid', async () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog
          open={true}
          onClose={mockOnClose}
          onEvalSelected={mockOnEvalSelected}
          title="Select an Eval"
          description="Please choose an evaluation from the list below."
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByTestId('select-eval'));

    expect(mockOnEvalSelected).toHaveBeenCalledTimes(1);
    expect(mockOnEvalSelected).toHaveBeenCalledWith('test-eval-id');
  });

  it('should pass focusedEvalId and filterByDatasetId to EvalsDataGrid', () => {
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

    expect(MockedEvalsDataGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        focusedEvalId: focusedEvalId,
        filterByDatasetId: filterByDatasetId,
      }),
      undefined,
    );
  });

  it('should pass onOpenFocusSearch to EvalsDataGrid as focusQuickFilterOnMount', () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog
          open={true}
          onClose={mockOnClose}
          onEvalSelected={mockOnEvalSelected}
          onOpenFocusSearch={true}
        />
      </MemoryRouter>,
    );

    expect(MockedEvalsDataGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        focusQuickFilterOnMount: true,
      }),
      undefined,
    );
  });

  it('should not render DialogTitle and description Box when title and description props are undefined or null', () => {
    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog open={true} onClose={mockOnClose} onEvalSelected={mockOnEvalSelected} />
      </MemoryRouter>,
    );

    expect(screen.queryByText((_, element) => element?.textContent === undefined)).toBeNull();

    expect(screen.queryByText((_, element) => element?.textContent === null)).toBeNull();

    expect(screen.getByTestId('mock-evals-data-grid')).toBeInTheDocument();
    expect(MockedEvalsDataGrid).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
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

    expect(MockedEvalsDataGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        filterByDatasetId: true,
        focusedEvalId: undefined,
        onEvalSelected: mockOnEvalSelected,
        focusQuickFilterOnMount: false,
      }),
      undefined,
    );
  });

  it('should display "No evals found" message when EvalsDataGrid has no evals', () => {
    MockedEvalsDataGrid.mockImplementationOnce(() => (
      <Box
        data-testid="mock-evals-data-grid"
        sx={{
          textAlign: 'center',
          color: 'text.secondary',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 3,
        }}
      >
        <Box sx={{ fontSize: '2rem', mb: 2 }}>🔍</Box>
        <Typography variant="h6" gutterBottom>
          No evals found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Try adjusting your search or create a new evaluation
        </Typography>
      </Box>
    ));

    const mockOnClose = vi.fn();
    const mockOnEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalSelectorDialog
          open={true}
          onClose={mockOnClose}
          onEvalSelected={mockOnEvalSelected}
          title="Select an Eval"
          description="Please choose an evaluation from the list below."
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('No evals found')).toBeInTheDocument();
  });
});
