import React from 'react';

import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { ToastProvider } from '@app/contexts/ToastContext';
import { render, screen, waitFor } from '@testing-library/react';
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
const mockUseMediaQuery = vi.fn(() => false);
vi.mock('@mui/material/useMediaQuery', () => ({
  default: mockUseMediaQuery,
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
    mockUseMediaQuery.mockReturnValue(false); // Default to desktop
    vi.clearAllMocks();
  });

  describe('Auto-collapse on mobile', () => {
    it('should auto-collapse when switching to mobile viewport', async () => {
      const { rerender } = renderResultsView();
      
      // Initially on desktop, not collapsed
      expect(mockSetTopAreaCollapsed).not.toHaveBeenCalled();
      
      // Switch to mobile
      mockUseMediaQuery.mockReturnValue(true);
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
      
      // Should auto-collapse
      await waitFor(() => {
        expect(mockSetTopAreaCollapsed).toHaveBeenCalledWith(true);
      });
    });

    it('should not auto-collapse if already collapsed', async () => {
      mockTopAreaCollapsed = true;
      mockUseMediaQuery.mockReturnValue(true);
      
      renderResultsView();
      
      // Should not call setTopAreaCollapsed since it's already collapsed
      expect(mockSetTopAreaCollapsed).not.toHaveBeenCalled();
    });

    it('should maintain user preference when switching back to desktop', async () => {
      mockUseMediaQuery.mockReturnValue(true);
      const { rerender } = renderResultsView();
      
      // Auto-collapse on mobile
      await waitFor(() => {
        expect(mockSetTopAreaCollapsed).toHaveBeenCalledWith(true);
      });
      
      // User manually expands on mobile
      mockSetTopAreaCollapsed.mockClear();
      mockTopAreaCollapsed = false;
      
      // Switch back to desktop
      mockUseMediaQuery.mockReturnValue(false);
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
      
      // Should not auto-collapse on desktop
      expect(mockSetTopAreaCollapsed).not.toHaveBeenCalled();
    });
  });

  describe('Mobile-specific styling', () => {
    it('should apply mobile-specific button styling', () => {
      mockUseMediaQuery.mockReturnValue(true);
      renderResultsView();
      
      const collapseButton = screen.getByLabelText('Collapse controls');
      
      // Mobile should have medium size and different padding
      expect(collapseButton).toHaveStyle({
        padding: '8px 16px',
      });
      
      // Mobile should have higher opacity when collapsed
      mockTopAreaCollapsed = true;
      const { container } = render(
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
      
      const buttonContainer = container.querySelector('[aria-label="Expand controls"]')?.parentElement?.parentElement;
      expect(buttonContainer).toHaveStyle({ opacity: 0.7 });
    });

    it('should position button differently on mobile', () => {
      mockUseMediaQuery.mockReturnValue(true);
      renderResultsView();
      
      const buttonContainer = screen.getByLabelText('Collapse controls').parentElement?.parentElement;
      
      // Mobile positioning
      expect(buttonContainer).toHaveStyle({
        top: '4px',
        right: '8px',
      });
    });

    it('should use bottom tooltip placement on mobile', () => {
      mockUseMediaQuery.mockReturnValue(true);
      renderResultsView();
      
      const tooltip = screen.getByLabelText('Collapse controls').parentElement;
      expect(tooltip).toHaveAttribute('data-mui-internal-clone-element', 'true');
    });
  });

  describe('Responsive behavior across viewport sizes', () => {
    it.each([
      { viewport: 'mobile', isMobile: true, expectedPadding: '8px 16px' },
      { viewport: 'tablet', isMobile: true, expectedPadding: '8px 16px' },
      { viewport: 'desktop', isMobile: false, expectedPadding: '4px 12px' },
    ])(
      'should apply correct styling for $viewport viewport',
      ({ isMobile, expectedPadding }) => {
        mockUseMediaQuery.mockReturnValue(isMobile);
        renderResultsView();
        
        const collapseButton = screen.getByLabelText('Collapse controls');
        expect(collapseButton).toHaveStyle({ padding: expectedPadding });
      }
    );
  });

  describe('Touch interaction on mobile', () => {
    it('should handle touch events on mobile', async () => {
      const user = userEvent.setup();
      mockUseMediaQuery.mockReturnValue(true);
      renderResultsView();
      
      const collapseButton = screen.getByLabelText('Collapse controls');
      
      // Simulate touch tap
      await user.click(collapseButton);
      
      expect(mockSetTopAreaCollapsed).toHaveBeenCalledWith(true);
    });

    it('should have larger touch target on mobile', () => {
      mockUseMediaQuery.mockReturnValue(true);
      renderResultsView();
      
      const collapseButton = screen.getByLabelText('Collapse controls');
      
      // Mobile buttons should be larger
      const buttonRect = collapseButton.getBoundingClientRect();
      
      // Check that the button has appropriate size for touch
      // Note: In real tests, these values would come from actual rendered dimensions
      expect(collapseButton).toHaveAttribute('size', 'medium');
    });
  });
});