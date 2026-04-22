import type { ReactNode } from 'react';

import { callApi } from '@app/utils/api';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalsTable from './EvalsTable';

// Mock the API
vi.mock('@app/utils/api');

vi.mock('@app/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock the DataTable component to simplify testing
vi.mock('@app/components/data-table/data-table', () => ({
  DataTable: ({
    columns,
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
          const favoriteColumn = columns?.find(
            (column: any) => column.accessorKey === 'isFavorite' || column.id === 'isFavorite',
          );
          return (
            <div key={rowId} data-testid={`row-${rowId}`}>
              {favoriteColumn?.cell?.({
                row: { original: row },
                getValue: () => row.isFavorite,
              })}
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
    createdAt: 1000,
    description: 'Original Description',
    datasetId: 'dataset-1',
    isFavorite: false,
    isRedteam: false,
    label: 'eval-1',
    numTests: 10,
    passRate: 90,
  },
  {
    evalId: 'eval-2',
    createdAt: 2000,
    description: 'Another Eval',
    datasetId: 'dataset-1',
    isFavorite: true,
    isRedteam: false,
    label: 'eval-2',
    numTests: 5,
    passRate: 100,
  },
];

const mockEvalsWithMultipleDatasets = [
  {
    evalId: 'eval-1',
    createdAt: 1000,
    description: 'Eval 1 - Dataset 1',
    datasetId: 'dataset-1',
    isFavorite: false,
    isRedteam: false,
    label: 'eval-1',
    numTests: 10,
    passRate: 90,
  },
  {
    evalId: 'eval-2',
    createdAt: 2000,
    description: 'Eval 2 - Dataset 1',
    datasetId: 'dataset-1',
    isFavorite: true,
    isRedteam: false,
    label: 'eval-2',
    numTests: 5,
    passRate: 100,
  },
  {
    evalId: 'eval-3',
    createdAt: 3000,
    description: 'Eval 3 - Dataset 2',
    datasetId: 'dataset-2',
    isFavorite: false,
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
    const user = userEvent.setup();
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

    await user.click(screen.getByTestId('select-eval-1'));

    expect(onEvalSelected).toHaveBeenCalledWith('eval-1');
  });

  it('should sort favorite evals first', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId(/^row-/).map((row) => row.dataset.testid)).toEqual([
      'row-eval-2',
      'row-eval-1',
    ]);
  });

  it('should toggle favorite status without selecting the row', async () => {
    const user = userEvent.setup();
    const mockCall = vi.mocked(callApi);
    mockCall.mockImplementation((url: string) => {
      if (url === '/results') {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ data: mockEvals }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          message: 'Favorite status updated successfully',
          isFavorite: true,
        }),
      } as any);
    });
    const onEvalSelected = vi.fn();

    render(
      <MemoryRouter>
        <EvalsTable onEvalSelected={onEvalSelected} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    await user.click(
      within(screen.getByTestId('row-eval-1')).getByRole('button', {
        name: 'Add to favorites',
      }),
    );

    expect(onEvalSelected).not.toHaveBeenCalled();
    expect(mockCall).toHaveBeenCalledWith('/eval/eval-1/favorite', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isFavorite: true }),
    });

    await waitFor(() => {
      expect(
        within(screen.getByTestId('row-eval-1')).getByRole('button', {
          name: 'Remove from favorites',
        }),
      ).toBeInTheDocument();
    });
  });

  it('should delete selected evals when delete button is clicked', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByTestId('checkbox-eval-1'));

    // Click delete button
    const deleteButton = await screen.findByTestId('delete-selected-button');
    await user.click(deleteButton);

    // Confirm deletion
    const confirmDelete = await screen.findByRole('button', { name: /^Delete$/ });
    await user.click(confirmDelete);

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
    const user = userEvent.setup();
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

    await user.click(screen.getByTestId('checkbox-eval-1'));

    // Click delete button
    const deleteButton = await screen.findByTestId('delete-selected-button');
    await user.click(deleteButton);

    // Cancel deletion
    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    // DELETE API should not have been called
    expect(mockCall).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should show delete button only when evals are selected', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByTestId('checkbox-eval-1'));

    // Delete button should now be visible
    const deleteButton = await screen.findByTestId('delete-selected-button');
    expect(deleteButton).toBeInTheDocument();

    await user.click(screen.getByTestId('checkbox-eval-1'));

    // Delete button should disappear
    await waitFor(() => {
      expect(screen.queryByTestId('delete-selected-button')).toBeNull();
    });
  });

  it('should handle API errors during deletion gracefully', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByTestId('checkbox-eval-1'));

    const deleteButton = await screen.findByTestId('delete-selected-button');
    await user.click(deleteButton);

    const confirmDelete = await screen.findByRole('button', { name: /^Delete$/ });
    await user.click(confirmDelete);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete evals:', expect.any(Error));
      expect(alertSpy).toHaveBeenCalledWith('Failed to delete evals');
    });

    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
