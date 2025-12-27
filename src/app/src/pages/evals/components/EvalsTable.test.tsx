import { callApi } from '@app/utils/api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalsTable from './EvalsTable';

// Mock the API
vi.mock('@app/utils/api');

// Mock the DataTable component to simplify testing
vi.mock('@app/components/data-table/data-table', () => ({
  DataTable: ({
    data,
    isLoading,
    error,
    onRowClick,
    enableRowSelection,
    rowSelection,
    onRowSelectionChange,
    getRowId,
    toolbarActions,
  }: any) => {
    if (isLoading) {
      return <div data-testid="loading">Loading...</div>;
    }

    if (error) {
      return <div data-testid="error">{error}</div>;
    }

    if (data.length === 0) {
      return <div data-testid="empty">No data</div>;
    }

    return (
      <div data-testid="data-table">
        {/* Render toolbar actions (like delete button) */}
        {toolbarActions && <div data-testid="toolbar-actions">{toolbarActions}</div>}
        {data.map((row: any) => {
          const rowId = getRowId ? getRowId(row) : row.evalId;
          const isSelected = rowSelection?.[rowId] || false;
          return (
            <div key={rowId} data-testid={`row-${rowId}`}>
              {enableRowSelection && (
                <input
                  type="checkbox"
                  data-testid={`checkbox-${rowId}`}
                  checked={isSelected}
                  onChange={(e) => {
                    const newSelection = { ...rowSelection };
                    if (e.target.checked) {
                      newSelection[rowId] = true;
                    } else {
                      delete newSelection[rowId];
                    }
                    onRowSelectionChange?.(newSelection);
                  }}
                />
              )}
              <button data-testid={`select-${rowId}`} onClick={() => onRowClick?.(row)}>
                {row.description || row.label}
              </button>
            </div>
          );
        })}
      </div>
    );
  },
}));

const mockEvals = [
  {
    evalId: 'eval-1',
    createdAt: Date.now(),
    description: 'Original Description',
    datasetId: 'dataset-1',
    isRedteam: false,
    label: 'eval-1',
    numTests: 10,
    passRate: 90,
  },
  {
    evalId: 'eval-2',
    createdAt: Date.now(),
    description: 'Another Eval',
    datasetId: 'dataset-1',
    isRedteam: false,
    label: 'eval-2',
    numTests: 5,
    passRate: 100,
  },
];

const mockEvalsWithMultipleDatasets = [
  {
    evalId: 'eval-1',
    createdAt: Date.now(),
    description: 'Eval 1 - Dataset 1',
    datasetId: 'dataset-1',
    isRedteam: false,
    label: 'eval-1',
    numTests: 10,
    passRate: 90,
  },
  {
    evalId: 'eval-2',
    createdAt: Date.now(),
    description: 'Eval 2 - Dataset 1',
    datasetId: 'dataset-1',
    isRedteam: false,
    label: 'eval-2',
    numTests: 5,
    passRate: 100,
  },
  {
    evalId: 'eval-3',
    createdAt: Date.now(),
    description: 'Eval 3 - Dataset 2',
    datasetId: 'dataset-2',
    isRedteam: false,
    label: 'eval-3',
    numTests: 8,
    passRate: 75,
  },
];

describe('EvalsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data on initial mount', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} deletionEnabled={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith(
        '/results',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });
  });

  it('should handle fetch errors gracefully', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('Failed to fetch evals'));

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} deletionEnabled={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('error')).toBeInTheDocument();
    });
  });

  it('should display only evals with the same datasetId as the focused eval when filterByDatasetId is true', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvalsWithMultipleDatasets }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} focusedEvalId="eval-1" filterByDatasetId={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('row-eval-1')).toBeInTheDocument();
      expect(screen.getByTestId('row-eval-2')).toBeInTheDocument();
      expect(screen.queryByTestId('row-eval-3')).toBeNull();
    });
  });

  it('should call onEvalSelected when a row is clicked', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const onEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={onEvalSelected} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('select-eval-1'));

    expect(onEvalSelected).toHaveBeenCalledWith('eval-1');
  });

  it('should delete selected evals when delete button is clicked', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };

    const mockCall = vi.mocked(callApi);
    mockCall.mockImplementation((_url: string, options?: any) => {
      if (!options || options.method !== 'DELETE') {
        return Promise.resolve(mockResponse as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} deletionEnabled={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    // Select an eval
    fireEvent.click(screen.getByTestId('checkbox-eval-1'));

    // Click delete button
    const deleteButton = await screen.findByTestId('delete-selected-button');
    fireEvent.click(deleteButton);

    // Confirm deletion
    const confirmDelete = await screen.findByRole('button', { name: /^Delete$/ });
    fireEvent.click(confirmDelete);

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith('/eval', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: ['eval-1'] }),
      });
    });
  });

  it('should not delete evals when user cancels the confirmation dialog', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };

    const mockCall = vi.mocked(callApi);
    mockCall.mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} deletionEnabled={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    // Select an eval
    fireEvent.click(screen.getByTestId('checkbox-eval-1'));

    // Click delete button
    const deleteButton = await screen.findByTestId('delete-selected-button');
    fireEvent.click(deleteButton);

    // Cancel deletion
    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    // DELETE API should not have been called
    expect(mockCall).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should show delete button only when evals are selected', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };

    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} deletionEnabled={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    // Delete button should not be visible initially
    expect(screen.queryByTestId('delete-selected-button')).toBeNull();

    // Select an eval
    fireEvent.click(screen.getByTestId('checkbox-eval-1'));

    // Delete button should now be visible
    const deleteButton = await screen.findByTestId('delete-selected-button');
    expect(deleteButton).toBeInTheDocument();

    // Deselect the eval
    fireEvent.click(screen.getByTestId('checkbox-eval-1'));

    // Delete button should disappear
    await waitFor(() => {
      expect(screen.queryByTestId('delete-selected-button')).toBeNull();
    });
  });

  it('should handle API errors during deletion gracefully', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };

    const mockCall = vi.mocked(callApi);
    let callCount = 0;
    mockCall.mockImplementation((_url: string, _options?: any) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockResponse as any);
      }
      return Promise.resolve({ ok: false } as any);
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} deletionEnabled={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('checkbox-eval-1'));

    const deleteButton = await screen.findByTestId('delete-selected-button');
    fireEvent.click(deleteButton);

    const confirmDelete = await screen.findByRole('button', { name: /^Delete$/ });
    fireEvent.click(confirmDelete);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete evals:', expect.any(Error));
      expect(alertSpy).toHaveBeenCalledWith('Failed to delete evals');
    });

    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
