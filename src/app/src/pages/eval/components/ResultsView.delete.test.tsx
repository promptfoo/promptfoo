import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsView from './ResultsView';
import * as useConfirmDialogModule from '@app/hooks/useConfirmDialog';
import * as apiTypesModule from '@app/utils/apiTypes';
import type { EvaluateTable, ResultLightweightWithLabel, UnifiedConfig } from '@promptfoo/types';

// Mock dependencies
vi.mock('@app/hooks/useConfirmDialog');
vi.mock('@app/utils/apiTypes');
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn().mockResolvedValue('test@example.com'),
  updateEvalAuthor: vi.fn().mockResolvedValue({}),
}));
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
vi.mock('@app/stores/evalConfig', () => ({
  useStore: () => ({ updateConfig: vi.fn() }),
}));
vi.mock('./store', () => ({
  useTableStore: () => mockTableStore,
  useResultsViewSettingsStore: () => mockResultsViewSettingsStore,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

const mockShowToast = vi.fn();
const mockNavigate = vi.fn();
const mockOnRecentEvalSelected = vi.fn();

const mockConfirm = vi.fn();
const mockConfirmDialog = vi.fn(() => null);

const mockTable: EvaluateTable = {
  head: {
    prompts: [
      { raw: 'prompt1', label: 'Prompt 1' },
      { raw: 'prompt2', label: 'Prompt 2' },
    ],
    vars: ['var1', 'var2'],
  },
  body: [
    {
      outputs: [{}, {}],
      vars: ['value1', 'value2'],
      test: {},
    },
    {
      outputs: [{}, {}],
      vars: ['value3', 'value4'],
      test: {},
    },
  ],
};

const mockConfig: Partial<UnifiedConfig> = {
  description: 'Test Eval',
};

const mockTableStore = {
  table: mockTable,
  config: mockConfig,
  evalId: 'test-eval-id',
  author: null,
  setAuthor: vi.fn(),
  filteredResultsCount: 2,
  totalResultsCount: 2,
  highlightedResultsCount: 0,
  filters: {
    values: {},
    appliedCount: 0,
  },
  removeFilter: vi.fn(),
  filterMode: 'all' as const,
  setFilterMode: vi.fn(),
  setConfig: vi.fn(),
};

const mockResultsViewSettingsStore = {
  setInComparisonMode: vi.fn(),
  columnStates: {},
  setColumnState: vi.fn(),
  maxTextLength: 100,
  wordBreak: 'break-word' as const,
  showInferenceDetails: false,
  comparisonEvalIds: [],
  setComparisonEvalIds: vi.fn(),
};

const createMockRecentEvals = (count: number): ResultLightweightWithLabel[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `eval-${i}`,
    label: `Eval ${i}`,
    description: `Description ${i}`,
    numTests: 10,
    createdAt: Date.now() - i * 1000,
  }));
};

describe('ResultsView - Delete Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup useConfirmDialog mock
    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockReturnValue({
      confirm: mockConfirm,
      ConfirmDialog: mockConfirmDialog,
      isConfirming: false,
    });
  });

  it('should show delete option in menu', async () => {
    const recentEvals = createMockRecentEvals(3);

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />
      </MemoryRouter>,
    );

    // Open the eval actions menu
    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('should open confirmation dialog when delete is clicked', async () => {
    const recentEvals = createMockRecentEvals(3);

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />
      </MemoryRouter>,
    );

    // Open menu and click delete
    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Verify confirm was called with correct config
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
    });

    const confirmCall = mockConfirm.mock.calls[0];
    expect(confirmCall[0]).toMatchObject({
      title: 'Delete Evaluation?',
      warningMessage: 'This action cannot be undone.',
      itemName: 'Test Eval',
    });
    expect(confirmCall[0].itemDetails).toContain('2 test results');
    expect(confirmCall[0].itemDetails).toContain('2 prompts');
  });

  it('should navigate to next eval after successful deletion', async () => {
    const recentEvals = createMockRecentEvals(3);
    // Current eval is eval-0, so next should be eval-1
    const currentEvalId = 'eval-0';

    vi.mocked(apiTypesModule.callApiTyped).mockResolvedValue({
      success: true,
      message: 'Eval deleted successfully',
    });

    const customTableStore = {
      ...mockTableStore,
      evalId: currentEvalId,
    };

    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockImplementation(() => {
      return {
        confirm: (config, onConfirm) => {
          // Immediately execute the confirm callback
          onConfirm();
          return Promise.resolve();
        },
        ConfirmDialog: () => null,
        isConfirming: false,
      };
    });

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId={currentEvalId}
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    await waitFor(() => {
      expect(mockOnRecentEvalSelected).toHaveBeenCalledWith('eval-1');
    });

    expect(mockShowToast).toHaveBeenCalledWith('Evaluation deleted successfully', 'success');
  });

  it('should navigate to previous eval if deleting last eval', async () => {
    const recentEvals = createMockRecentEvals(3);
    // Current eval is eval-2 (last one), so should go to eval-1
    const currentEvalId = 'eval-2';

    vi.mocked(apiTypesModule.callApiTyped).mockResolvedValue({
      success: true,
      message: 'Eval deleted successfully',
    });

    let capturedConfirmCallback: (() => Promise<void>) | null = null;

    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockImplementation(() => {
      return {
        confirm: (config, onConfirm) => {
          capturedConfirmCallback = onConfirm;
          return Promise.resolve();
        },
        ConfirmDialog: () => null,
        isConfirming: false,
      };
    });

    const customTableStore = {
      ...mockTableStore,
      evalId: currentEvalId,
    };

    // Need to mock the store with custom evalId
    vi.doMock('./store', () => ({
      useTableStore: () => customTableStore,
      useResultsViewSettingsStore: () => mockResultsViewSettingsStore,
    }));

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId={currentEvalId}
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Execute the captured callback
    if (capturedConfirmCallback) {
      await capturedConfirmCallback();
    }

    await waitFor(() => {
      expect(mockOnRecentEvalSelected).toHaveBeenCalledWith('eval-1');
    });
  });

  it('should navigate to home if deleting only eval', async () => {
    const recentEvals = createMockRecentEvals(1);

    vi.mocked(apiTypesModule.callApiTyped).mockResolvedValue({
      success: true,
      message: 'Eval deleted successfully',
    });

    let capturedConfirmCallback: (() => Promise<void>) | null = null;

    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockImplementation(() => {
      return {
        confirm: (config, onConfirm) => {
          capturedConfirmCallback = onConfirm;
          return Promise.resolve();
        },
        ConfirmDialog: () => null,
        isConfirming: false,
      };
    });

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="eval-0"
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Execute the captured callback
    if (capturedConfirmCallback) {
      await capturedConfirmCallback();
    }

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    expect(mockShowToast).toHaveBeenCalledWith('Evaluation deleted successfully', 'success');
  });

  it('should show error toast when deletion fails with ApiError', async () => {
    const recentEvals = createMockRecentEvals(3);

    const apiError = new apiTypesModule.ApiError('Database is busy', 'DATABASE_BUSY', 503);

    vi.mocked(apiTypesModule.callApiTyped).mockRejectedValue(apiError);

    let capturedConfirmCallback: (() => Promise<void>) | null = null;

    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockImplementation(() => {
      return {
        confirm: (config, onConfirm) => {
          capturedConfirmCallback = onConfirm;
          return Promise.resolve();
        },
        ConfirmDialog: () => null,
        isConfirming: false,
      };
    });

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Execute the captured callback
    if (capturedConfirmCallback) {
      await expect(capturedConfirmCallback()).rejects.toThrow();
    }

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Database is busy. Please try again in a moment.',
        'warning',
      );
    });

    // Should NOT navigate on error
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockOnRecentEvalSelected).not.toHaveBeenCalled();
  });

  it('should handle NOT_FOUND error and navigate away', async () => {
    const recentEvals = createMockRecentEvals(3);

    const apiError = new apiTypesModule.ApiError(
      'Evaluation not found',
      'NOT_FOUND',
      404,
    );

    vi.mocked(apiTypesModule.callApiTyped).mockRejectedValue(apiError);

    let capturedConfirmCallback: (() => Promise<void>) | null = null;

    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockImplementation(() => {
      return {
        confirm: (config, onConfirm) => {
          capturedConfirmCallback = onConfirm;
          return Promise.resolve();
        },
        ConfirmDialog: () => null,
        isConfirming: false,
      };
    });

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Execute the captured callback
    if (capturedConfirmCallback) {
      await expect(capturedConfirmCallback()).rejects.toThrow();
    }

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Evaluation not found. It may have already been deleted.',
        'warning',
      );
    });

    // Should navigate away even on NOT_FOUND
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('should handle CONSTRAINT_VIOLATION error', async () => {
    const recentEvals = createMockRecentEvals(3);

    const apiError = new apiTypesModule.ApiError(
      'Cannot delete: evaluation is referenced by other records',
      'CONSTRAINT_VIOLATION',
      409,
    );

    vi.mocked(apiTypesModule.callApiTyped).mockRejectedValue(apiError);

    let capturedConfirmCallback: (() => Promise<void>) | null = null;

    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockImplementation(() => {
      return {
        confirm: (config, onConfirm) => {
          capturedConfirmCallback = onConfirm;
          return Promise.resolve();
        },
        ConfirmDialog: () => null,
        isConfirming: false,
      };
    });

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Execute the captured callback
    if (capturedConfirmCallback) {
      await expect(capturedConfirmCallback()).rejects.toThrow();
    }

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Cannot delete: evaluation is referenced by other records.',
        'error',
      );
    });

    // Should NOT navigate on constraint violation
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should handle generic Error', async () => {
    const recentEvals = createMockRecentEvals(3);

    const genericError = new Error('Network failure');

    vi.mocked(apiTypesModule.callApiTyped).mockRejectedValue(genericError);

    let capturedConfirmCallback: (() => Promise<void>) | null = null;

    vi.mocked(useConfirmDialogModule.useConfirmDialog).mockImplementation(() => {
      return {
        confirm: (config, onConfirm) => {
          capturedConfirmCallback = onConfirm;
          return Promise.resolve();
        },
        ConfirmDialog: () => null,
        isConfirming: false,
      };
    });

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Execute the captured callback
    if (capturedConfirmCallback) {
      await expect(capturedConfirmCallback()).rejects.toThrow();
    }

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to delete evaluation: Network failure',
        'error',
      );
    });
  });

  it('should show error if evalId is missing', async () => {
    const recentEvals = createMockRecentEvals(3);

    const customTableStore = {
      ...mockTableStore,
      evalId: null,
    };

    vi.doMock('./store', () => ({
      useTableStore: () => customTableStore,
      useResultsViewSettingsStore: () => mockResultsViewSettingsStore,
    }));

    render(
      <MemoryRouter>
        <ResultsView
          recentEvals={recentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
        />
      </MemoryRouter>,
    );

    const menuButton = screen.getByText('Eval actions');
    await userEvent.click(menuButton);

    const deleteMenuItem = screen.getByText('Delete');
    await userEvent.click(deleteMenuItem);

    // Since evalId is null, confirm should not be called
    // Instead, should show error toast immediately
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Cannot delete: Eval ID not found', 'error');
    });

    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
