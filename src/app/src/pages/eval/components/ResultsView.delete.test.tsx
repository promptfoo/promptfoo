import React from 'react';

import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsView from './ResultsView';

const mockShowToast = vi.fn();
const mockNavigate = vi.fn();
const mockOnRecentEvalSelected = vi.fn();
const mockUseTableStore = vi.fn();
const mockUseResultsViewSettingsStore = vi.fn();

// Mock dependencies
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn().mockResolvedValue(null),
  updateEvalAuthor: vi.fn(),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('./FilterModeProvider', () => ({
  useFilterMode: () => ({ filterMode: 'all', setFilterMode: vi.fn() }),
  DEFAULT_FILTER_MODE: 'all',
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./store', () => ({
  useTableStore: () => mockUseTableStore(),
  useResultsViewSettingsStore: () => mockUseResultsViewSettingsStore(),
}));

vi.mock('@app/stores/evalConfig', () => ({
  useStore: () => ({
    updateConfig: vi.fn(),
  }),
}));

vi.mock('@app/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@app/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@app/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./EvalHeader', async () => {
  const React = await import('react');
  return {
    default: ({ actions, children }: { actions?: React.ReactNode; children?: React.ReactNode }) => {
      const [isActionsOpen, setIsActionsOpen] = React.useState(false);
      return (
        <div>
          <button type="button" onClick={() => setIsActionsOpen((prev) => !prev)}>
            Eval actions
          </button>
          {isActionsOpen && <div onClick={() => setIsActionsOpen(false)}>{actions}</div>}
          {children}
        </div>
      );
    },
  };
});

vi.mock('./ResultsTable', () => ({
  default: () => <div data-testid="results-table" />,
}));

vi.mock('./ResultsCharts', () => ({
  default: () => <div data-testid="results-charts" />,
}));

vi.mock('./ColumnSelector', () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock('./ConfigModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Config modal</div> : null),
}));

vi.mock('./ConfirmEvalNameDialog', () => ({
  ConfirmEvalNameDialog: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div>{title}</div> : null,
}));

vi.mock('./DownloadMenu', () => ({
  DownloadDialog: ({ open }: { open: boolean }) => (open ? <div>Download dialog</div> : null),
  DownloadMenuItem: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Download
    </button>
  ),
}));

vi.mock('./EvalSelectorDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Eval selector</div> : null),
}));

vi.mock('./FilterChips', () => ({
  FilterChips: () => <div data-testid="filter-chips" />,
}));

vi.mock('./FilterModeSelector', () => ({
  FilterModeSelector: () => <div data-testid="filter-mode-selector" />,
}));

vi.mock('./HiddenColumnChips', () => ({
  HiddenColumnChips: () => <div data-testid="hidden-column-chips" />,
}));

vi.mock('./ResultsFilters/FiltersForm', () => ({
  default: () => <div data-testid="filters-form" />,
}));

vi.mock('./ShareModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Share modal</div> : null),
}));

vi.mock('./TableSettings/TableSettingsModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Settings modal</div> : null),
}));

vi.mock('./CompareEvalMenuItem', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Compare
    </button>
  ),
}));

describe('ResultsView - Delete Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    recentEvals: [
      {
        evalId: 'eval-1',
        datasetId: null,
        label: 'Eval 1',
        createdAt: 1000,
        description: 'Test eval 1',
        numTests: 10,
      },
      {
        evalId: 'eval-2',
        datasetId: null,
        label: 'Eval 2',
        createdAt: 2000,
        description: 'Test eval 2',
        numTests: 10,
      },
      {
        evalId: 'eval-3',
        datasetId: null,
        label: 'Eval 3',
        createdAt: 3000,
        description: 'Test eval 3',
        numTests: 10,
      },
    ],
    onRecentEvalSelected: mockOnRecentEvalSelected,
    defaultEvalId: 'eval-2',
  };

  // Helper to render with mock store data
  const renderWithMockData = (props = defaultProps) => {
    mockUseTableStore.mockReturnValue({
      evalId: props.defaultEvalId,
      config: { description: 'Test Eval' },
      table: {
        head: {
          prompts: [{ raw: 'Test prompt' }],
          vars: ['var1'],
        },
        body: [],
      },
      totalResultsCount: 100,
      filteredResultsCount: 100,
      highlightedResultsCount: 0,
      filters: {
        appliedCount: 0,
        values: {},
        options: {
          metric: [],
          plugin: [],
          strategy: [],
          severity: [],
          policy: [],
        },
      },
      filterMode: 'all',
      setConfig: vi.fn(),
      setAuthor: vi.fn(),
      setFilterMode: vi.fn(),
      removeFilter: vi.fn(),
      author: null,
    });

    mockUseResultsViewSettingsStore.mockReturnValue({
      columnStates: {},
      setColumnState: vi.fn(),
      maxTextLength: 100,
      wordBreak: 'break-word',
      showInferenceDetails: false,
      comparisonEvalIds: [],
      setComparisonEvalIds: vi.fn(),
      setInComparisonMode: vi.fn(),
      hiddenVarNamesBySchema: {},
      setHiddenVarNamesForSchema: vi.fn(),
    });

    return renderWithProviders(
      <MemoryRouter>
        <ResultsView {...props} />
      </MemoryRouter>,
    );
  };

  it('should open delete confirmation dialog when delete is clicked', async () => {
    renderWithMockData();

    // Open eval actions menu
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);

    // Click delete
    const deleteMenuItem = screen.getByText('Delete');
    fireEvent.click(deleteMenuItem);

    // Dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    // "Test Eval" may appear in multiple places (dialog title and elsewhere)
    expect(screen.getAllByText('Test Eval').length).toBeGreaterThan(0);
    // Check that results and prompts are shown in the dialog
    const results = screen.getAllByText(/100 result/);
    expect(results.length).toBeGreaterThan(0);
    const prompts = screen.getAllByText(/1 prompt/);
    expect(prompts.length).toBeGreaterThan(0);
  });

  it('should close dialog when cancel is clicked', async () => {
    renderWithMockData();

    // Open delete dialog
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByText('Delete eval?')).not.toBeInTheDocument();
    });
  });

  it('should successfully delete and navigate to next eval', async () => {
    const { callApi } = await import('@app/utils/api');
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Eval deleted successfully' }),
    } as Response);

    renderWithMockData();

    // Open delete dialog
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    // Confirm delete
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Eval deleted', 'success');
    });

    // Should navigate to next eval (eval-3)
    expect(mockOnRecentEvalSelected).toHaveBeenCalledWith('eval-3');
  });

  it('should navigate to previous eval when deleting last eval', async () => {
    const { callApi } = await import('@app/utils/api');
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Eval deleted successfully' }),
    } as Response);

    // Current eval is the last one (eval-3)
    renderWithMockData({ ...defaultProps, defaultEvalId: 'eval-3' });

    // Open delete dialog
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    // Confirm delete
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockOnRecentEvalSelected).toHaveBeenCalledWith('eval-2');
    });
  });

  it('should navigate home when deleting only eval', async () => {
    const { callApi } = await import('@app/utils/api');
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Eval deleted successfully' }),
    } as Response);

    renderWithMockData({
      ...defaultProps,
      recentEvals: [
        {
          evalId: 'eval-1',
          datasetId: null,
          label: 'Eval 1',
          createdAt: 1000,
          description: 'Test eval 1',
          numTests: 10,
        },
      ],
      defaultEvalId: 'eval-1',
    });

    // Open delete dialog
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    // Confirm delete
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('should show error toast on delete failure', async () => {
    const { callApi } = await import('@app/utils/api');
    vi.mocked(callApi).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Database error' }),
    } as Response);

    renderWithMockData();

    // Open delete dialog
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    // Confirm delete
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to delete eval: Database error', 'error');
    });
  });

  it('should show loading state during deletion', async () => {
    const { callApi } = await import('@app/utils/api');
    let resolveDelete: () => void;
    vi.mocked(callApi).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveDelete = () =>
          resolve({
            ok: true,
            json: async () => ({ message: 'Success' }),
          } as Response);
      }),
    );

    renderWithMockData();

    // Open delete dialog
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    // Confirm delete
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });

    // Buttons should be disabled
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();

    // Resolve delete
    resolveDelete!();

    // Should close dialog
    await waitFor(() => {
      expect(screen.queryByText('Delete eval?')).not.toBeInTheDocument();
    });
  });

  it('should handle network errors gracefully', async () => {
    const { callApi } = await import('@app/utils/api');
    vi.mocked(callApi).mockRejectedValue(new Error('Network error'));

    renderWithMockData();

    // Open delete dialog
    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    // Confirm delete
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to delete eval: Network error', 'error');
    });
  });

  it('should not close delete confirmation dialog by clicking outside or pressing escape when deletion is in progress', async () => {
    const { callApi } = await import('@app/utils/api');
    let resolveDelete: () => void;
    vi.mocked(callApi).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveDelete = () =>
          resolve({
            ok: true,
            json: async () => ({ message: 'Success' }),
          } as Response);
      }),
    );

    renderWithMockData();

    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    // Radix Dialog sets pointer-events: none on body when modal is open, use fireEvent instead
    fireEvent.click(document.body);

    // Use fireEvent for Escape key as well since pointer-events may affect keyboard events
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument();
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    resolveDelete!();

    await waitFor(() => {
      expect(screen.queryByText('Delete eval?')).not.toBeInTheDocument();
    });
  });

  it('should navigate home when deleting an eval not in recentEvals', async () => {
    const { callApi } = await import('@app/utils/api');
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Eval deleted successfully' }),
    } as Response);

    renderWithMockData({
      ...defaultProps,
      defaultEvalId: 'non-existent-eval',
    });

    const actionsButton = screen.getByText('Eval actions');
    fireEvent.click(actionsButton);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete eval?')).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });
});
