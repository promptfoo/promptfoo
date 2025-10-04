import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ResultsView from './ResultsView';
import type { ResultLightweightWithLabel } from '@promptfoo/types';
import { useTableStore, useResultsViewSettingsStore } from './store';

// Mock all the required modules
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@app/stores/evalConfig', () => ({
  useStore: () => ({
    updateConfig: vi.fn(),
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  }),
  fetchUserEmail: vi.fn().mockResolvedValue('test@example.com'),
  updateEvalAuthor: vi.fn().mockResolvedValue({}),
}));

vi.mock('./store', () => {
  const mockUseTableStore = vi.fn();
  const mockUseResultsViewSettingsStore = vi.fn();

  return {
    useResultsViewSettingsStore: mockUseResultsViewSettingsStore,
    useTableStore: mockUseTableStore,
  };
});

vi.mock('./ShareModal', () => ({
  default: vi.fn(({ open, onClose }) =>
    open ? <div data-testid="share-modal">Share Modal</div> : null,
  ),
}));

vi.mock('./ResultsTable', () => ({
  default: () => <div data-testid="results-table">Results Table</div>,
}));

vi.mock('./ResultsCharts', () => ({
  default: () => <div data-testid="results-charts">Results Charts</div>,
}));

// Mock other components that aren't relevant to sharing tests
vi.mock('./ColumnSelector', () => ({
  ColumnSelector: () => <div>Column Selector</div>,
}));

vi.mock('./FilterModeSelector', () => ({
  FilterModeSelector: () => <div>Filter Mode Selector</div>,
}));

vi.mock('./ResultsFilters/FiltersButton', () => ({
  default: () => <div>Filters Button</div>,
}));

vi.mock('./ResultsFilters/FiltersForm', () => ({
  default: () => <div>Filters Form</div>,
}));

vi.mock('./AuthorChip', () => ({
  AuthorChip: () => <div>Author Chip</div>,
}));

vi.mock('./EvalIdChip', () => ({
  EvalIdChip: () => <div>Eval ID Chip</div>,
}));

vi.mock('./ConfigModal', () => ({
  default: () => <div>Config Modal</div>,
}));

vi.mock('./TableSettings/TableSettingsModal', () => ({
  default: () => <div>Settings Modal</div>,
}));

vi.mock('./DownloadMenu', () => ({
  default: () => <div>Download Menu</div>,
}));

vi.mock('./CompareEvalMenuItem', () => ({
  default: () => <div>Compare Eval Menu Item</div>,
}));

vi.mock('./EvalSelectorDialog', () => ({
  default: () => <div>Eval Selector Dialog</div>,
}));

vi.mock('./EvalSelectorKeyboardShortcut', () => ({
  default: () => <div>Eval Selector Keyboard Shortcut</div>,
}));

const mockRecentEvals: ResultLightweightWithLabel[] = [
  {
    evalId: 'eval-1',
    datasetId: null,
    label: 'Evaluation 1',
    createdAt: new Date('2023-01-01T00:00:00Z').getTime(),
    description: 'Test evaluation 1',
    numTests: 5,
  },
];

const renderWithRouter = (component: React.ReactElement) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe('ResultsView Share Button', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useResultsViewSettingsStore).mockReturnValue({
      setInComparisonMode: vi.fn(),
      columnStates: {},
      setColumnState: vi.fn(),
      maxTextLength: 100,
      wordBreak: 'break-word',
      showInferenceDetails: true,
      comparisonEvalIds: [],
      setComparisonEvalIds: vi.fn(),
    });

    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
            {
              label: 'Test Prompt 2',
              provider: 'openai:gpt-3.5-turbo',
              raw: 'Test prompt 2',
            },
          ],
          vars: ['input'],
        },
        body: [],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });
  });

  it('always shows share button regardless of config.sharing value', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Click on Eval actions to open the dropdown
    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    // Share button should be visible
    await waitFor(() => {
      expect(screen.getByText('Share')).toBeInTheDocument();
    });
  });

  it('opens share modal when share button is clicked', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    const shareButton = screen.getByText('Share');
    await userEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByTestId('share-modal')).toBeInTheDocument();
    });
  });

  it('shows share button alongside other menu items', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    await waitFor(() => {
      // Verify share button is present alongside other expected menu items
      expect(screen.getByText('Share')).toBeInTheDocument();
      expect(screen.getByText('Edit name')).toBeInTheDocument();
      expect(screen.getByText('Edit and re-run')).toBeInTheDocument();
      expect(screen.getByText('View YAML')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });
});

describe('ResultsView', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useResultsViewSettingsStore).mockReturnValue({
      setInComparisonMode: vi.fn(),
      columnStates: {},
      setColumnState: vi.fn(),
      maxTextLength: 100,
      wordBreak: 'break-word',
      showInferenceDetails: true,
      comparisonEvalIds: [],
      setComparisonEvalIds: vi.fn(),
    });

    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
            {
              label: 'Test Prompt 2',
              provider: 'openai:gpt-3.5-turbo',
              raw: 'Test prompt 2',
            },
          ],
          vars: ['input'],
        },
        body: [
          {
            description: 'Test Description',
            outputs: [
              {
                score: 0.8,
              },
              {
                score: 0.6,
              },
            ],
          },
          {
            description: 'Test Description',
            outputs: [
              {
                score: 0.7,
              },
              {
                score: 0.9,
              },
            ],
          },
        ],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });

    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1100);
  });
  it('renders ResultsCharts when conditions are met and charts are shown by default', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    expect(screen.getByTestId('results-charts')).toBeInTheDocument();

    const hideChartsButton = screen.getByText('Hide Charts');
    expect(hideChartsButton).toBeInTheDocument();
  });

  it('renders charts when there are multiple prompts and at least two different valid scores, even when some scores are NaN', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
            {
              label: 'Test Prompt 2',
              provider: 'openai:gpt-3.5-turbo',
              raw: 'Test prompt 2',
            },
          ],
          vars: ['input'],
        },
        body: [
          {
            outputs: [{ score: 0.5 }, { score: NaN }],
            description: 'Test row 1',
          },
          {
            outputs: [{ score: NaN }, { score: 0.7 }],
            description: 'Test row 2',
          },
        ],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    expect(screen.getByTestId('results-charts')).toBeInTheDocument();
  });

  it('does not render ResultsCharts when table data is in a loading state', () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [],
          vars: [],
        },
        body: [],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    expect(screen.queryByTestId('results-charts')).toBeNull();
  });

  it('should not render charts when there are multiple prompts and valid scores, but all scores are the same, even after clicking show charts', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
            {
              label: 'Test Prompt 2',
              provider: 'openai:gpt-3.5-turbo',
              raw: 'Test prompt 2',
            },
          ],
          vars: ['input'],
        },
        body: [
          {
            id: '1',
            description: 'Test Description',
            vars: ['test input'],
            outputs: [{ score: 1 }, { score: 1 }],
            latency: 100,
            tokens: 50,
          },
          {
            id: '2',
            description: 'Test Description',
            vars: ['test input'],
            outputs: [{ score: 1 }, { score: 1 }],
            latency: 100,
            tokens: 50,
          },
        ],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    expect(screen.queryByText('Show Charts')).toBeNull();

    expect(screen.queryByTestId('results-charts')).toBeNull();
  });
});

describe('ResultsView Chart Rendering', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useResultsViewSettingsStore).mockReturnValue({
      setInComparisonMode: vi.fn(),
      columnStates: {},
      setColumnState: vi.fn(),
      maxTextLength: 100,
      wordBreak: 'break-word',
      showInferenceDetails: true,
      comparisonEvalIds: [],
      setComparisonEvalIds: vi.fn(),
    });

    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [],
          vars: [],
        },
        body: [],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });
  });
  it('should not render ResultsCharts if there is only one prompt', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
          ],
          vars: ['input'],
        },
        body: [{ outputs: [{ score: 0.8 }] }],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const showChartsButton = screen.queryByText('Show Charts');
    expect(showChartsButton).toBeNull();

    const resultsCharts = screen.queryByTestId('results-charts');
    expect(resultsCharts).toBeNull();
  });

  it('should not render ResultsCharts if all scores are the same', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
            {
              label: 'Test Prompt 2',
              provider: 'openai:gpt-3.5-turbo',
              raw: 'Test prompt 2',
            },
          ],
          vars: ['input'],
        },
        body: [{ outputs: [{ score: 0.8 }, { score: 0.8 }] }],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const showChartsButton = screen.queryByText('Show Charts');
    expect(showChartsButton).toBeNull();

    const resultsCharts = screen.queryByTestId('results-charts');
    expect(resultsCharts).toBeNull();
  });

  it('should not render ResultsCharts if there are no valid scores', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
            {
              label: 'Test Prompt 2',
              provider: 'openai:gpt-3.5-turbo',
              raw: 'Test prompt 2',
            },
          ],
          vars: ['input'],
        },
        body: [{ outputs: [{ score: NaN }, { score: NaN }] }],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const showChartsButton = screen.queryByText('Show Charts');
    expect(showChartsButton).toBeNull();

    const resultsCharts = screen.queryByTestId('results-charts');
    expect(resultsCharts).toBeNull();
  });
});

describe('ResultsView with extreme score values', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1100);

    vi.mocked(useResultsViewSettingsStore).mockReturnValue({
      setInComparisonMode: vi.fn(),
      columnStates: {},
      setColumnState: vi.fn(),
      maxTextLength: 100,
      wordBreak: 'break-word',
      showInferenceDetails: true,
      comparisonEvalIds: [],
      setComparisonEvalIds: vi.fn(),
    });

    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [
            {
              label: 'Test Prompt 1',
              provider: 'openai:gpt-4',
              raw: 'Test prompt 1',
            },
            {
              label: 'Test Prompt 2',
              provider: 'openai:gpt-3.5-turbo',
              raw: 'Test prompt 2',
            },
          ],
          vars: ['input'],
        },
        body: [
          {
            description: 'Test row 1',
            outputs: [{ score: 1e10 }, { score: 1e11 }],
          },
          {
            description: 'Test row 2',
            outputs: [{ score: 1e10 }, { score: 1e11 }],
          },
        ],
      },
      config: {
        description: 'Test Evaluation',
        sharing: true,
        tags: { env: 'test' },
      },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 2,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });
  });

  it('renders ResultsCharts when there are multiple prompts and extreme score values with variance', () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const resultsCharts = screen.getByTestId('results-charts');
    expect(resultsCharts).toBeInTheDocument();
  });
});
