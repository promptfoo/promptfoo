import React from 'react';

import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { ToastProvider } from '@app/contexts/ToastContext';
import { render, screen } from '@testing-library/react';
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
  {
    id: '2',
    label: 'Eval 2',
    description: 'Description 2',
    evalId: '2',
    isRedteam: false,
    datasetId: 'd2',
    createdAt: new Date('2023-01-02').getTime(),
    numTests: 15,
    passRate: 0.9,
  },
];

const mockColumnState = {
  selectedColumns: ['Variable 1', 'Prompt 1'],
  columnVisibility: { 'Variable 1': true, 'Prompt 1': true },
};

const mockTableWithHighlights = {
  head: {
    prompts: [{ provider: 'test-provider' }],
    vars: ['Variable 1'],
  },
  body: [
    {
      outputs: [
        {
          pass: true,
          score: 1,
          text: 'test output',
          gradingResult: { comment: '!highlight This is important' },
        },
      ],
      test: {},
      vars: ['test var'],
    },
    {
      outputs: [
        {
          pass: false,
          score: 0,
          text: 'test output 2',
          gradingResult: { comment: '!highlight Another highlight' },
        },
      ],
      test: {},
      vars: ['test var 2'],
    },
  ],
};

const mockTableWithoutHighlights = {
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

// Mock the router hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  };
});

// Mock the store hooks - we'll modify this per test
let mockTableStoreData = {
  table: mockTableWithoutHighlights,
  setTable: vi.fn(),
  config: { description: 'Test Config', tags: {} },
  setConfig: vi.fn(),
  evalId: '1',
  author: 'Test Author',
  recentEvals: mockRecentEvals,
  fetchEvalData: vi.fn(),
  evals: mockRecentEvals,
  setAuthor: vi.fn(),
  filteredResultsCount: 10,
  totalResultsCount: 10,
  highlightedResultsCount: 0,
  filters: {
    values: {},
    appliedCount: 0,
    options: {
      metric: [] as string[],
      metadata: [] as string[],
    },
  },
};

let mockResultsViewSettingsStoreData = {
  stickyHeader: true,
  setStickyHeader: vi.fn(),
  inComparisonMode: false,
  setInComparisonMode: vi.fn(),
  columnStates: { '1': mockColumnState },
  setColumnState: vi.fn(),
  maxTextLength: 100,
  wordBreak: 'break-word',
  showInferenceDetails: true,
  comparisonEvalIds: [],
  setComparisonEvalIds: vi.fn(),
  renderMarkdown: true,
};

vi.mock('./store', () => ({
  useTableStore: vi.fn(() => mockTableStoreData),
  useResultsViewSettingsStore: vi.fn(() => mockResultsViewSettingsStoreData),
}));

// Mock the API functions
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(() => {
    return {
      ok: true,
      async json() {
        return { data: mockRecentEvals };
      },
    };
  }),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  updateEvalAuthor: vi.fn(),
}));

// Mock the main store
vi.mock('@app/stores/evalConfig', () => ({
  useStore: vi.fn(() => ({
    setStateFromConfig: vi.fn(),
  })),
}));

// Mock the useToast hook
vi.mock('@app/hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    showToast: vi.fn(),
  })),
}));

// Mock the useShiftKey hook
vi.mock('@app/hooks/useShiftKey', () => {
  const ShiftKeyContext = { Provider: ({ children }: { children: React.ReactNode }) => children };
  return {
    ShiftKeyContext,
    useShiftKey: vi.fn(() => false),
  };
});

vi.mock('./ResultsCharts', () => {
  return {
    default: vi.fn(() => <div data-testid="results-charts">ResultsCharts Mock</div>),
  };
});

declare global {
  interface Window {
    resizeHandler: any;
  }
}

// Helper function for rendering with providers
const renderWithProviders = (ui: React.ReactNode) => {
  return render(
    <MemoryRouter>
      <ShiftKeyContext.Provider value={false}>
        <ToastProvider>{ui}</ToastProvider>
      </ShiftKeyContext.Provider>
    </MemoryRouter>,
  );
};

describe('ResultsView', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default state
    mockTableStoreData = {
      table: mockTableWithoutHighlights,
      setTable: vi.fn(),
      config: { description: 'Test Config', tags: {} },
      setConfig: vi.fn(),
      evalId: '1',
      author: 'Test Author',
      recentEvals: mockRecentEvals,
      fetchEvalData: vi.fn(),
      evals: mockRecentEvals,
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 10,
      highlightedResultsCount: 0,
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [] as string[],
          metadata: [] as string[],
        },
      },
    };

    mockResultsViewSettingsStoreData = {
      stickyHeader: true,
      setStickyHeader: vi.fn(),
      inComparisonMode: false,
      setInComparisonMode: vi.fn(),
      columnStates: { '1': mockColumnState },
      setColumnState: vi.fn(),
      maxTextLength: 100,
      wordBreak: 'break-word',
      showInferenceDetails: true,
      comparisonEvalIds: [],
      setComparisonEvalIds: vi.fn(),
      renderMarkdown: true,
    };
  });

  it('renders ResultsCharts when table, config, and more than one prompt are present and viewport height is at least 1100px', () => {
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1200,
    });

    mockTableStoreData = {
      ...mockTableStoreData,
      table: {
        head: {
          prompts: [{ provider: 'test-provider' }, { provider: 'test-provider-2' }],
          vars: ['Variable 1'],
        },
        body: [
          {
            outputs: [{ pass: true, score: 1, text: 'test output' }],
            test: {},
            vars: ['test var'],
          },
        ],
      },
      config: { description: 'Test Config', tags: {} },
    };

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    expect(screen.getByTestId('results-charts')).toBeInTheDocument();
  });
  it('renders without crashing', () => {
    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    // Verify key elements are rendered
    expect(screen.getByText('Table Settings')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
  });

  it('does not show highlighted count when there are no highlighted cells', () => {
    mockTableStoreData.highlightedResultsCount = 0;

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    // Highlighted chip should not be present
    expect(screen.queryByText(/highlighted/)).not.toBeInTheDocument();
  });

  it('shows highlighted count when there are highlighted cells', () => {
    mockTableStoreData.table = mockTableWithHighlights;
    mockTableStoreData.highlightedResultsCount = 2;

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    // Highlighted chip should be present with correct count
    expect(screen.getByText('2 highlighted')).toBeInTheDocument();
  });

  it('shows correct singular form for one highlighted cell', () => {
    mockTableStoreData.highlightedResultsCount = 1;

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    // Should show "1 highlighted" (not "1 highlighted cells")
    expect(screen.getByText('1 highlighted')).toBeInTheDocument();
  });

  it('shows highlighted count visually separated from results count', () => {
    mockTableStoreData.highlightedResultsCount = 3;

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    // Both results count and highlighted count should be present but separate
    expect(screen.getByText('10 results')).toBeInTheDocument();
    expect(screen.getByText('3 highlighted')).toBeInTheDocument();

    // The highlighted chip should have distinct styling (blue color scheme)
    const highlightedChip = screen.getByText('3 highlighted').closest('.MuiChip-root');
    expect(highlightedChip).toHaveStyle({
      backgroundColor: 'rgba(25, 118, 210, 0.08)',
      color: 'rgba(25, 118, 210, 1)',
    });
  });

  it('renders FiltersButton and FiltersForm when filters are available', () => {
    mockTableStoreData = {
      ...mockTableStoreData,
      filters: {
        ...mockTableStoreData.filters,
        options: {
          metric: ['accuracy', 'f1-score'],
          metadata: [],
        },
      },
    };

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('does not render FiltersButton, FiltersForm, or MetricFilterSelector when there are no available metric filters', () => {
    mockTableStoreData.filters.options.metric = [];

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    expect(screen.queryByTestId('filters-button')).toBeNull();
    expect(screen.queryByTestId('filters-form')).toBeNull();
    expect(screen.queryByTestId('metric-filter-selector')).toBeNull();
  });

  it('should not update charts visibility state on window resize after mount', () => {
    const initialInnerHeight = 1200;
    const newInnerHeight = 900;

    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: initialInnerHeight,
    });

    const { container } = renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    const originalAddEventListener = window.addEventListener;
    window.addEventListener = vi.fn((event, handler) => {
      if (event === 'resize') {
        window.resizeHandler = handler;
      } else {
        originalAddEventListener(event, handler);
      }
    });

    window.innerHeight = newInnerHeight;
    if (window.resizeHandler) {
      window.resizeHandler();
    }

    expect(container).toBeInTheDocument();
  });

  it('renders ResultsView without crashing when columnVisibility and recentEvals props are not passed to ResultsCharts', () => {
    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    expect(screen.getByText('Table Settings')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
  });

  it('should not render ResultsCharts when all prompts are hidden', () => {
    mockTableStoreData.table = {
      head: {
        prompts: [{ provider: 'test-provider' }, { provider: 'another-provider' }],
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
    mockResultsViewSettingsStoreData = {
      ...mockResultsViewSettingsStoreData,
      columnStates: {
        '1': {
          selectedColumns: ['Variable 1'],
          columnVisibility: { 'Variable 1': true, 'Prompt 1': false },
        },
      },
    };

    vi.mock('./store', () => ({
      useTableStore: vi.fn(() => mockTableStoreData),
      useResultsViewSettingsStore: vi.fn(() => mockResultsViewSettingsStoreData),
    }));

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    expect(screen.queryByTestId('results-charts')).toBeNull();
  });

  it('hides ResultsCharts when viewport height is less than 1100px', () => {
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 900,
    });

    mockTableStoreData.table = {
      head: {
        prompts: [{ provider: 'test-provider' }, { provider: 'test-provider' }],
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

    mockTableStoreData.config = { description: 'Test Config', tags: {} };

    const { container } = renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    expect(screen.queryByTestId('results-charts')).toBeNull();
    expect(container).toBeInTheDocument();
  });

  it('renders ResultsCharts with scores outside the normal range', () => {
    mockTableStoreData.table = {
      head: {
        prompts: [{ provider: 'test-provider' }, { provider: 'another-provider' }],
        vars: ['Variable 1'],
      },
      body: [
        {
          outputs: [{ pass: true, score: -0.5, text: 'test output' }],
          test: {},
          vars: ['test var'],
        },
        {
          outputs: [{ pass: false, score: 1.5, text: 'test output 2' }],
          test: {},
          vars: ['test var 2'],
        },
      ],
    };
    mockTableStoreData.config = { description: 'Test Config', tags: {} };

    mockResultsViewSettingsStoreData = {
      ...mockResultsViewSettingsStoreData,
      renderMarkdown: true,
    };

    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    const showChartsButton = screen.getByText('Show Charts');
    expect(showChartsButton).toBeInTheDocument();
  });
});
