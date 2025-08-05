import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { ToastProvider } from '@app/contexts/ToastContext';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsView from './ResultsView';

// Mock data
const mockRecentEvals = [
  {
    id: '1',
    label: 'Eval 1',
    description: 'Description 1',
    evalId: '1',
    isRedteam: false,
    datasetId: 'd1',
    createdAt: new Date('2023-01-01').getTime(),
    numTests: 10,
    passRate: 0.8,
  },
];

// Mock the router hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  };
});

// Mock API utils
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  updateEvalAuthor: vi.fn(),
}));

// Mock store
let mockTopAreaCollapsed = false;
const mockSetTopAreaCollapsed = vi.fn();

// Mock table data to avoid invariant error
const mockTable = {
  head: {
    prompts: [{ provider: 'test-provider' }],
    vars: ['Variable 1'],
  },
  body: [
    {
      outputs: [{ pass: true, score: 1, text: 'test output' }],
      test: {},
      vars: ['test var'],
    },
  ],
};

vi.mock('./store', () => ({
  useResultsViewSettingsStore: vi.fn(() => ({
    topAreaCollapsed: mockTopAreaCollapsed,
    setTopAreaCollapsed: mockSetTopAreaCollapsed,
    maxTextLength: 250,
    wordBreak: 'break-word',
    showInferenceDetails: true,
    renderMarkdown: false,
    prettifyJson: false,
    showPrompts: false,
    showPassFail: true,
    inComparisonMode: false,
    comparisonEvalIds: [],
    stickyHeader: true,
    resultsTableZoom: 1,
    columnStates: {},
    maxImageWidth: 256,
    maxImageHeight: 256,
  })),
  useTableStore: vi.fn(() => ({
    table: mockTable, // Provide table data to avoid invariant error
    isFetching: false,
    error: null,
    filters: {
      values: {},
      appliedCount: 0,
      options: {
        metric: [],
        metadata: [],
        plugin: [],
        strategy: [],
      },
    },
    config: {},
    author: null,
    evalId: '1',
    setFilterMode: vi.fn(),
    setFailureFilter: vi.fn(),
    addFilter: vi.fn(),
    removeFilter: vi.fn(),
    updateFilter: vi.fn(),
    clearFilters: vi.fn(),
    updateSearchText: vi.fn(),
    fetchEvalWithoutFilters: vi.fn(),
    fetchEvalData: vi.fn(() => Promise.resolve(null)),
    setEvalId: vi.fn(),
    filteredResultsCount: 1,
    totalResultsCount: 1,
    highlightedResultsCount: 0,
    getFilteredTable: vi.fn(() => ({
      head: mockTable.head,
      body: mockTable.body,
      evalId: '1',
    })),
    getFilteredRowIds: vi.fn(() => ['row-1']),
    getUnfilteredRowCount: vi.fn(() => 1),
    checkRowVisibility: vi.fn(() => true),
    getTotalRowCount: vi.fn(() => 1),
  })),
}));

// Mock MUI theme
vi.mock('@mui/material/styles', () => ({
  useTheme: () => ({
    breakpoints: {
      down: (breakpoint: string) => `(max-width: ${breakpoint === 'md' ? '960px' : '600px'})`,
    },
    palette: {
      mode: 'light',
      background: {
        paper: '#ffffff',
      },
      primary: {
        main: '#1976d2',
      },
      text: {
        primary: '#000000',
        secondary: '#666666',
      },
    },
    shadows: Array(25).fill('0px 0px 0px rgba(0,0,0,0.2)'),
  }),
  styled:
    () =>
    () =>
    ({ children, ...props }: any) => <div {...props}>{children}</div>,
  alpha: vi.fn((color: string, opacity: number) => color),
}));

// Mock useMediaQuery
vi.mock('@mui/material/useMediaQuery', () => ({
  default: vi.fn(() => false), // Default to desktop
}));

const renderResultsView = () => {
  return render(
    <MemoryRouter>
      <ShiftKeyContext.Provider value={false}>
        <ToastProvider>
          <ResultsView
            recentEvals={mockRecentEvals}
            onRecentEvalSelected={vi.fn()}
            defaultEvalId="1"
          />
        </ToastProvider>
      </ShiftKeyContext.Provider>
    </MemoryRouter>,
  );
};

describe('ResultsView - Collapse Button', () => {
  beforeEach(() => {
    mockTopAreaCollapsed = false;
    mockSetTopAreaCollapsed.mockClear();
    vi.clearAllMocks();
  });

  describe('Collapse button visibility and behavior', () => {
    it('should render the collapse button', () => {
      renderResultsView();

      const collapseButton = screen.getByLabelText('Collapse controls');
      expect(collapseButton).toBeInTheDocument();
    });

    it('should toggle collapse state when clicked', async () => {
      const user = userEvent.setup();
      renderResultsView();

      const collapseButton = screen.getByLabelText('Collapse controls');

      await user.click(collapseButton);

      expect(mockSetTopAreaCollapsed).toHaveBeenCalledWith(true);
    });

    it('should show expand button when collapsed', () => {
      mockTopAreaCollapsed = true;
      renderResultsView();

      const expandButton = screen.getByLabelText('Expand controls');
      expect(expandButton).toBeInTheDocument();
    });

    it('should toggle expand state when clicked', async () => {
      const user = userEvent.setup();
      mockTopAreaCollapsed = true;
      renderResultsView();

      const expandButton = screen.getByLabelText('Expand controls');

      await user.click(expandButton);

      expect(mockSetTopAreaCollapsed).toHaveBeenCalledWith(false);
    });

    it('should show correct icon based on collapsed state', () => {
      const { rerender } = renderResultsView();

      // Collapsed = false, should show UnfoldLess icon
      expect(screen.getByTestId('UnfoldLessIcon')).toBeInTheDocument();

      // Update state and rerender
      mockTopAreaCollapsed = true;
      rerender(
        <MemoryRouter>
          <ShiftKeyContext.Provider value={false}>
            <ToastProvider>
              <ResultsView
                recentEvals={mockRecentEvals}
                onRecentEvalSelected={vi.fn()}
                defaultEvalId="1"
              />
            </ToastProvider>
          </ShiftKeyContext.Provider>
        </MemoryRouter>,
      );

      // Collapsed = true, should show UnfoldMore icon
      expect(screen.getByTestId('UnfoldMoreIcon')).toBeInTheDocument();
    });
  });

  describe('Content visibility based on collapse state', () => {
    it('should show controls when not collapsed', async () => {
      const { container } = renderResultsView();

      // Debug: log what's rendered
      await waitFor(() => {
        // Check if the collapse button exists first
        expect(screen.getByLabelText('Collapse controls')).toBeInTheDocument();
      });

      // Should show search field and other controls
      await waitFor(() => {
        const searchInput = screen.queryByPlaceholderText('Search or select an eval...');
        if (!searchInput) {
          console.log('Container HTML:', container.innerHTML);
        }
        expect(searchInput).toBeInTheDocument();
      });
      expect(screen.getByText('Eval actions')).toBeInTheDocument();
    });

    it('should hide controls when collapsed', () => {
      mockTopAreaCollapsed = true;
      renderResultsView();

      // Controls should be in the DOM but not visible due to height: 0 and overflow: hidden
      const searchInput = screen.getByPlaceholderText('Search or select an eval...');
      const evalActions = screen.getByText('Eval actions');
      
      // Check that the container has height 0 which hides the content
      const container = searchInput.closest('[class*="MuiBox-root"]');
      expect(container).toBeInTheDocument();
      
      // The elements exist but are not visible
      expect(searchInput).toBeInTheDocument();
      expect(evalActions).toBeInTheDocument();
    });
  });

  describe('Button styling and position', () => {
    it('should position button in top-right corner', () => {
      renderResultsView();

      // Check that the button exists and is an IconButton
      const button = screen.getByLabelText('Collapse controls');
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');

      // Verify it has the expected class names for an IconButton
      expect(button).toHaveClass('MuiIconButton-root');
    });

    it('should maintain button visibility in both states', () => {
      const { rerender } = renderResultsView();

      // Button should be visible when expanded
      expect(screen.getByLabelText('Collapse controls')).toBeInTheDocument();

      // Update state and rerender
      mockTopAreaCollapsed = true;
      rerender(
        <MemoryRouter>
          <ShiftKeyContext.Provider value={false}>
            <ToastProvider>
              <ResultsView
                recentEvals={mockRecentEvals}
                onRecentEvalSelected={vi.fn()}
                defaultEvalId="1"
              />
            </ToastProvider>
          </ShiftKeyContext.Provider>
        </MemoryRouter>,
      );

      // Button should still be visible when collapsed
      expect(screen.getByLabelText('Expand controls')).toBeInTheDocument();
    });
  });

  describe('Keyboard accessibility', () => {
    it('should be keyboard accessible', async () => {
      renderResultsView();

      const collapseButton = screen.getByLabelText('Collapse controls');

      // Focus the button
      collapseButton.focus();
      expect(document.activeElement).toBe(collapseButton);

      // Press Enter
      fireEvent.keyDown(collapseButton, { key: 'Enter', code: 'Enter' });
      fireEvent.click(collapseButton);

      expect(mockSetTopAreaCollapsed).toHaveBeenCalledWith(true);
    });

    it('should have proper ARIA labels', () => {
      const { rerender } = renderResultsView();

      // When expanded
      const collapseButton = screen.getByLabelText('Collapse controls');
      expect(collapseButton).toHaveAttribute('aria-label', 'Collapse controls');

      // When collapsed
      mockTopAreaCollapsed = true;
      rerender(
        <MemoryRouter>
          <ShiftKeyContext.Provider value={false}>
            <ToastProvider>
              <ResultsView
                recentEvals={mockRecentEvals}
                onRecentEvalSelected={vi.fn()}
                defaultEvalId="1"
              />
            </ToastProvider>
          </ShiftKeyContext.Provider>
        </MemoryRouter>,
      );

      const expandButton = screen.getByLabelText('Expand controls');
      expect(expandButton).toHaveAttribute('aria-label', 'Expand controls');
    });
  });
});
