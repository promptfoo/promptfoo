import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ResultsView from './ResultsView';
import type { ResultLightweightWithLabel } from '@promptfoo/types';
import { useTableStore, useResultsViewSettingsStore } from './store';
import { callApi } from '@app/utils/api';

// Mock all the required modules
const mockShowToast = vi.fn();

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock('@app/stores/evalConfig', () => ({
  useStore: () => ({
    updateConfig: vi.fn(),
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
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
  default: vi.fn(({ open }) => (open ? <div data-testid="share-modal">Share Modal</div> : null)),
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

vi.mock('./ConfirmEvalNameDialog', () => ({
  ConfirmEvalNameDialog: vi.fn(
    ({ open, showSizeWarning, itemCount, itemLabel, onConfirm, currentName }) => {
      return open ? (
        <div data-testid="confirm-eval-name-dialog">
          {showSizeWarning && (
            <div data-testid="size-warning">
              Size Warning: {itemCount} {itemLabel}
            </div>
          )}
          <div>Item Count: {itemCount}</div>
          <input
            data-testid="description-input"
            aria-label="Description"
            defaultValue={currentName}
          />
          <button
            data-testid="create-copy-button"
            onClick={() => {
              const input = document.querySelector(
                '[data-testid="description-input"]',
              ) as HTMLInputElement;
              onConfirm(input.value);
            }}
          >
            Create Copy
          </button>
        </div>
      ) : null;
    },
  ),
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

describe('ResultsView Copy Eval', () => {
  const mockOnRecentEvalSelected = vi.fn();
  const mockCallApi = vi.mocked(callApi);
  const mockWindowOpen = vi.spyOn(window, 'open');

  beforeEach(() => {
    vi.clearAllMocks();

    mockWindowOpen.mockImplementation(() => null);

    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'new-eval-id', distinctTestCount: 1234 }),
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: 'http://example.com',
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      text: () => Promise.resolve(''),
      body: null,
      bytes: () => Promise.resolve(new Uint8Array()),
      clone: () => ({
        ok: true,
        json: () => Promise.resolve({ id: 'new-eval-id', distinctTestCount: 1234 }),
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        redirected: false,
        type: 'basic',
        url: 'http://example.com',
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve(''),
        body: null,
        bytes: () => Promise.resolve(new Uint8Array()),
        clone: () => ({ ...mockCallApi.mock.results[0].value }),
      }),
    });

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

  it('handleCopyEval correctly extracts id and distinctTestCount from the API response JSON and uses them to open the new tab and show the success toast', async () => {
    const newEvalId = 'new-eval-id';
    const distinctTestCount = 1234;

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    const copyMenuItem = screen.getByText('Copy');
    await userEvent.click(copyMenuItem);

    const descriptionInput = screen.getByLabelText('Description');
    await userEvent.type(descriptionInput, 'Copied Evaluation');

    const createCopyButton = screen.getByText('Create Copy');
    await userEvent.click(createCopyButton);

    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(`/eval/${newEvalId}`, '_blank');
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        `Copied ${distinctTestCount.toLocaleString()} results successfully`,
        'success',
      );
    });
  });
});
describe('ResultsView Copy Menu Item', () => {
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

  it('should close menu and open copy dialog when Copy menu item is clicked', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    expect(screen.getByRole('menu')).toBeInTheDocument();

    const copyMenuItem = screen.getByText('Copy');
    await userEvent.click(copyMenuItem);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      expect(screen.getByTestId('confirm-eval-name-dialog')).toBeInTheDocument();
      expect(screen.getByText('Item Count: 15')).toBeInTheDocument();
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

describe('ResultsView - Size Warning in Copy Dialog', () => {
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
      filteredResultsCount: 15000,
      totalResultsCount: 15000,
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

  it('displays size warning in ConfirmEvalNameDialog when totalResultsCount is greater than 10000', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    const copyMenuItem = screen.getByText('Copy');
    await userEvent.click(copyMenuItem);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-eval-name-dialog')).toBeInTheDocument();
    });

    const confirmEvalNameDialog = screen.getByTestId('confirm-eval-name-dialog');
    expect(confirmEvalNameDialog).toBeInTheDocument();
    expect(screen.getByTestId('size-warning')).toBeInTheDocument();

    expect(screen.getByText('Item Count: 15000')).toBeInTheDocument();
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
  });

  it('should call handleCopyEval even when the description is the same', async () => {
    const mockCallApi = vi.mocked(callApi);
    mockCallApi.mockClear();

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

    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    const copyButton = screen.getByText('Copy');
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-eval-name-dialog')).toBeInTheDocument();
    });

    const descriptionInput = screen.getByLabelText('Description');
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, 'Test Evaluation');

    const createCopyButton = screen.getByText('Create Copy');
    await userEvent.click(createCopyButton);

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalled();
    });
  });
});

describe('ResultsView Size Warning', () => {
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
      filteredResultsCount: 15000,
      totalResultsCount: 15000,
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

  it('should display a size warning in the ConfirmEvalNameDialog when the evaluation has more than 10,000 results', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const evalActionsButton = screen.getByText('Eval actions');
    await userEvent.click(evalActionsButton);

    const copyMenuItem = screen.getByText('Copy');
    await userEvent.click(copyMenuItem);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-eval-name-dialog')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('size-warning')).toBeInTheDocument();
    });

    expect(screen.getByTestId('size-warning')).toHaveTextContent('Size Warning: 15000 results');
  });
});
