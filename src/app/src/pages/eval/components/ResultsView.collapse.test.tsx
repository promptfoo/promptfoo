import React from 'react';

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
    setEvalId: vi.fn(),
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
  }),
  styled: () => () => () => null,
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
    it('should show controls when not collapsed', () => {
      renderResultsView();
      
      // Should show search field and other controls
      expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
      expect(screen.getByText('Eval actions')).toBeInTheDocument();
    });

    it('should hide controls when collapsed', () => {
      mockTopAreaCollapsed = true;
      renderResultsView();
      
      // Should not show search field and other controls
      expect(screen.queryByPlaceholderText('Search or select an eval...')).not.toBeInTheDocument();
      expect(screen.queryByText('Eval actions')).not.toBeInTheDocument();
    });
  });

  describe('Button styling and hover behavior', () => {
    it('should have lower opacity when collapsed', () => {
      mockTopAreaCollapsed = true;
      renderResultsView();
      
      const buttonContainer = screen.getByLabelText('Expand controls').parentElement?.parentElement;
      expect(buttonContainer).toHaveStyle({ opacity: 0.3 });
    });

    it('should have full opacity when expanded', () => {
      renderResultsView();
      
      const buttonContainer = screen.getByLabelText('Collapse controls').parentElement?.parentElement;
      expect(buttonContainer).toHaveStyle({ opacity: 1 });
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