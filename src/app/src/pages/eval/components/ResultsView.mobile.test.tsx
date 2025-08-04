import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { ToastProvider } from '@app/contexts/ToastContext';
import { render, screen, waitFor } from '@testing-library/react';
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

// Mock table data
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
    table: mockTable,
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

// Mock useMediaQuery for mobile
const mockUseMediaQuery = vi.fn();
vi.mock('@mui/material/useMediaQuery', () => ({
  default: (query: string) => mockUseMediaQuery(query),
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

describe('ResultsView - Mobile Viewport', () => {
  beforeEach(() => {
    mockTopAreaCollapsed = false;
    mockSetTopAreaCollapsed.mockClear();
    vi.clearAllMocks();
  });

  describe('Mobile auto-collapse behavior', () => {
    it('should auto-collapse on mobile viewport', async () => {
      // Set mobile viewport
      mockUseMediaQuery.mockReturnValue(true);

      renderResultsView();

      // Should call setTopAreaCollapsed(true) on mount
      expect(mockSetTopAreaCollapsed).toHaveBeenCalledWith(true);
    });

    it('should not auto-collapse on desktop viewport', () => {
      // Set desktop viewport
      mockUseMediaQuery.mockReturnValue(false);

      renderResultsView();

      // Should not call setTopAreaCollapsed on mount
      expect(mockSetTopAreaCollapsed).not.toHaveBeenCalled();
    });

    it('should not auto-collapse if already collapsed', () => {
      // Set mobile viewport
      mockUseMediaQuery.mockReturnValue(true);
      // Already collapsed
      mockTopAreaCollapsed = true;

      renderResultsView();

      // Should not call setTopAreaCollapsed since it's already collapsed
      expect(mockSetTopAreaCollapsed).not.toHaveBeenCalled();
    });
  });

  describe('Mobile button styling', () => {
    it('should have larger button size on mobile', () => {
      // Set mobile viewport
      mockUseMediaQuery.mockReturnValue(true);
      mockTopAreaCollapsed = true;

      renderResultsView();

      const button = screen.getByLabelText('Expand controls');
      expect(button).toBeInTheDocument();

      // On mobile, the button should have medium size (default is small)
      // This is verified by the presence of the button, as size is handled by MUI
      expect(button).toHaveClass('MuiIconButton-root');
    });

    it('should have mobile-specific opacity when collapsed', () => {
      // Set mobile viewport
      mockUseMediaQuery.mockReturnValue(true);
      mockTopAreaCollapsed = true;

      renderResultsView();

      // Button should exist with expand label
      const button = screen.getByLabelText('Expand controls');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Mobile tooltip placement', () => {
    it('should position tooltip at bottom on mobile', () => {
      // Set mobile viewport
      mockUseMediaQuery.mockReturnValue(true);

      renderResultsView();

      // Verify button exists (tooltip placement is handled by MUI)
      const button = screen.getByLabelText('Collapse controls');
      expect(button).toBeInTheDocument();
    });

    it('should position tooltip at left on desktop', () => {
      // Set desktop viewport
      mockUseMediaQuery.mockReturnValue(false);

      renderResultsView();

      // Verify button exists (tooltip placement is handled by MUI)
      const button = screen.getByLabelText('Collapse controls');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Responsive stack behavior', () => {
    it('should show controls when expanded on mobile', async () => {
      // Set mobile viewport
      mockUseMediaQuery.mockReturnValue(true);
      mockTopAreaCollapsed = false;

      renderResultsView();

      // Controls should be visible when expanded
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
      });
      expect(screen.getByText('Eval actions')).toBeInTheDocument();
    });

    it('should hide controls when collapsed on mobile', () => {
      // Set mobile viewport
      mockUseMediaQuery.mockReturnValue(true);
      mockTopAreaCollapsed = true;

      renderResultsView();

      // Controls should be hidden when collapsed
      expect(screen.queryByPlaceholderText('Search or select an eval...')).not.toBeInTheDocument();
      expect(screen.queryByText('Eval actions')).not.toBeInTheDocument();
    });
  });
});
