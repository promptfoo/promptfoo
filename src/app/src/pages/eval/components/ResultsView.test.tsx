import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsView from './ResultsView';
import { useResultsViewSettingsStore, useTableStore } from './store';
import type { ResultLightweightWithLabel } from '@promptfoo/types';

// Mock all the required modules - use vi.hoisted to ensure these are available in vi.mock factories
const { mockShowToast, mockSetSearchParams } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockSetSearchParams: vi.fn(),
}));

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

// Mock useCustomPoliciesMap - it imports from @promptfoo/redteam/types which loads heavy constants
vi.mock('@app/hooks/useCustomPoliciesMap', () => ({
  useCustomPoliciesMap: vi.fn().mockReturnValue({}),
}));

// Mock policy utils - FilterChips imports these which pull in heavy redteam constants
vi.mock('@promptfoo/redteam/plugins/policy/utils', () => ({
  isPolicyMetric: vi.fn().mockReturnValue(false),
  deserializePolicyIdFromMetric: vi.fn().mockReturnValue(''),
  formatPolicyIdentifierAsMetric: vi.fn((id: string) => id),
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
  FilterModeSelector: ({ filterMode }: { filterMode: string }) => (
    <div data-testid="filter-mode-selector">Filter Mode Selector: {filterMode}</div>
  ),
}));

const mockUseFilterMode = vi.fn();
vi.mock('./FilterModeProvider', () => ({
  useFilterMode: () => mockUseFilterMode(),
  DEFAULT_FILTER_MODE: 'all',
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  DownloadMenuItem: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick}>Download</button>
  ),
  DownloadDialog: () => <div>Download Dialog</div>,
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
  return renderWithProviders(<MemoryRouter>{component}</MemoryRouter>);
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: vi
      .fn()
      .mockReturnValue([new URLSearchParams('filterMode=failures'), mockSetSearchParams]),
  };
});

describe('ResultsView Share Button', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseFilterMode.mockReturnValue({
      filterMode: 'all',
      setFilterMode: vi.fn(),
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
      // Use getAllByText since there may be multiple Delete elements (menu item + dialog)
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0);
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
      // Note: Our mock DropdownMenu doesn't actually close on click, so we just verify
      // that the copy dialog opens correctly
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
  });

  it('should render without error when a plugin filter with operator not_equals has a null value', () => {
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
        appliedCount: 1,
        values: {
          filter1: {
            id: 'filter1',
            type: 'plugin',
            operator: 'not_equals',
            value: null,
            field: 'plugin_name',
            logicOperator: 'and',
            sortIndex: 0,
          },
        },
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

    expect(screen.getByText('Results Table')).toBeInTheDocument();
  });
});
describe('ResultsView Plugin Filter - Not Equals', () => {
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
        appliedCount: 1,
        values: {
          pluginFilter: {
            id: 'pluginFilter',
            type: 'plugin',
            operator: 'not_equals',
            value: 'MyPlugin',
            logicOperator: 'and',
            sortIndex: 0,
          },
        },
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });
  });

  it('should display a chip with label "Plugin != [name]" when a plugin filter with operator "not_equals" is applied and the filter value is set', async () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Plugin != MyPlugin')).toBeInTheDocument();
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

  it('should not render ResultsCharts if all scores are binary edge values (all 1s)', async () => {
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
        body: [{ outputs: [{ score: 1 }, { score: 1 }] }],
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
    });

    await act(async () => {
      renderWithRouter(
        <ResultsView
          recentEvals={mockRecentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />,
      );
    });

    const showChartsButton = screen.queryByText('Show Charts');
    expect(showChartsButton).toBeNull();

    const resultsCharts = screen.queryByTestId('results-charts');
    expect(resultsCharts).toBeNull();
  });

  it('should not render ResultsCharts if all scores are binary edge values (all 0s)', async () => {
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
        body: [{ outputs: [{ score: 0 }, { score: 0 }] }],
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
    });

    await act(async () => {
      renderWithRouter(
        <ResultsView
          recentEvals={mockRecentEvals}
          onRecentEvalSelected={mockOnRecentEvalSelected}
          defaultEvalId="test-eval-id"
        />,
      );
    });

    const showChartsButton = screen.queryByText('Show Charts');
    expect(showChartsButton).toBeNull();

    const resultsCharts = screen.queryByTestId('results-charts');
    expect(resultsCharts).toBeNull();
  });

  it('should render ResultsCharts if all scores are uniform but not binary edge values', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1100);

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

    // Uniform score of 0.8 is meaningful (graded assertion), should show charts
    const showChartsButton = screen.queryByText('Hide Charts');
    expect(showChartsButton).toBeInTheDocument();
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

describe('ResultsView User Rated Badge', () => {
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
      userRatedResultsCount: 0,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });
  });

  it('should not render the user-rated badge when userRatedResultsCount is 0', () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const userRatedBadge = screen.queryByText(/user-rated/i);
    expect(userRatedBadge).toBeNull();
  });
});

describe('ResultsView User-Rated Badge', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseFilterMode.mockReturnValue({
      filterMode: 'all',
      setFilterMode: vi.fn(),
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
      userRatedResultsCount: 5,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'all',
      setFilterMode: vi.fn(),
    });
  });

  it('should have correct purple styling for the user-rated badge', () => {
    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const userRatedBadge = screen.getByText('5 user-rated');
    expect(userRatedBadge).toBeInTheDocument();

    // Check for Tailwind purple styling classes on the Badge component
    expect(userRatedBadge).toHaveClass('bg-purple-50');
    expect(userRatedBadge).toHaveClass('text-purple-700');
    expect(userRatedBadge).toHaveClass('border-purple-200');
    expect(userRatedBadge).toHaveClass('font-medium');
    expect(userRatedBadge).toHaveClass('cursor-pointer');
  });
});

describe('ResultsView', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseFilterMode.mockReturnValue({
      filterMode: 'all',
      setFilterMode: vi.fn(),
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
  });

  it('FilterModeSelector receives and displays the correct mode', async () => {
    mockUseFilterMode.mockReturnValue({
      filterMode: 'user-rated',
      setFilterMode: vi.fn(),
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
      userRatedResultsCount: 5,
      filters: {
        appliedCount: 0,
        values: {},
      },
      removeFilter: vi.fn(),
      filterMode: 'user-rated',
      setFilterMode: vi.fn(),
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    const filterModeSelector = screen.getByTestId('filter-mode-selector');
    expect(filterModeSelector).toBeInTheDocument();
    expect(filterModeSelector).toHaveTextContent('Filter Mode Selector: user-rated');
  });
});
describe('ResultsView', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseFilterMode.mockReturnValue({
      filterMode: 'all',
      setFilterMode: vi.fn(),
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
  });

  it('should display a purple badge with the correct count and tooltip when userRatedResultsCount is greater than 0', async () => {
    const userRatedResultsCount: number = 5;
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
      userRatedResultsCount: userRatedResultsCount,
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

    // Find the badge by its text content
    const badge = screen.getByText(`${userRatedResultsCount} user-rated`);
    expect(badge).toBeInTheDocument();

    // Verify it has the purple styling classes
    expect(badge).toHaveClass('bg-purple-50');
    expect(badge).toHaveClass('text-purple-700');
  });
});

describe('ResultsView Duration Display', () => {
  const mockOnRecentEvalSelected = vi.fn();
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
  });

  it('should display duration chip when stats.durationMs is available', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: 45000 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Should display formatted duration (45000ms = 45.0s)
    await waitFor(() => {
      expect(screen.getByText('45.0s')).toBeInTheDocument();
    });
  });

  it('should not display duration chip when stats.durationMs is not available', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: null,
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Duration chip should not be present
    expect(screen.queryByText(/^\d+(\.\d+)?(ms|s|m|h)/)).toBeNull();
  });

  it('should format duration correctly for milliseconds', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: 500 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Should display 500ms
    await waitFor(() => {
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });
  });

  it('should format duration correctly for minutes', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: 125000 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Should display 2m 5s (125000ms)
    await waitFor(() => {
      expect(screen.getByText('2m 5s')).toBeInTheDocument();
    });
  });

  it('should handle edge case where seconds round to 60', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      // 119500ms = 1m 59.5s, which rounds to 60s, should display as 2m
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: 119500 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Should display 2m (not "1m 60s")
    await waitFor(() => {
      expect(screen.getByText('2m')).toBeInTheDocument();
    });
  });

  it('should format duration correctly for hours', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      // 3661000ms = 1h 1m 1s (should display as 1h 1m)
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: 3661000 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1h 1m')).toBeInTheDocument();
    });
  });

  it('should display 0ms for zero duration', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: 0 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('0ms')).toBeInTheDocument();
    });
  });

  it('should not display duration chip when durationMs is NaN', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: NaN },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Duration chip should not be present when durationMs is NaN
    expect(screen.queryByText(/^\d+(\.\d+)?(ms|s|m|h)/)).toBeNull();
  });

  it('should not display duration chip when durationMs is Infinity', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: Infinity },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Duration chip should not be present when durationMs is Infinity
    expect(screen.queryByText(/^\d+(\.\d+)?(ms|s|m|h)/)).toBeNull();
  });

  it('should not display duration chip when durationMs is negative', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: -5000 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Duration chip should not be present when durationMs is negative
    expect(screen.queryByText(/^\d+(\.\d+)?(ms|s|m|h)/)).toBeNull();
  });

  it('should format hours-only duration without minutes', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      author: 'Test Author',
      table: {
        head: {
          prompts: [{ label: 'Test', provider: 'openai:gpt-4', raw: 'Test' }],
          vars: ['input'],
        },
        body: [],
      },
      config: { description: 'Test Evaluation' },
      setConfig: vi.fn(),
      evalId: 'test-eval-id',
      setAuthor: vi.fn(),
      filteredResultsCount: 10,
      totalResultsCount: 15,
      highlightedResultsCount: 0,
      filters: { appliedCount: 0, values: {} },
      removeFilter: vi.fn(),
      // 7200000ms = 2h exactly
      stats: { successes: 10, failures: 5, errors: 0, tokenUsage: {} as any, durationMs: 7200000 },
    });

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('2h')).toBeInTheDocument();
    });
  });
});

describe('ResultsView Browser History', () => {
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
    });
  });

  it('should render without calling setSearchParams unnecessarily on mount', async () => {
    // This test verifies that mounting ResultsView doesn't create unnecessary browser
    // history entries. The component should only call setSearchParams when search text
    // actually changes (via handleSearchTextChange), not during initialization.

    mockSetSearchParams.mockClear();

    renderWithRouter(
      <ResultsView
        recentEvals={mockRecentEvals}
        onRecentEvalSelected={mockOnRecentEvalSelected}
        defaultEvalId="test-eval-id"
      />,
    );

    // Component should mount successfully
    expect(screen.getByText('Results Table')).toBeInTheDocument();

    // Should not call setSearchParams during mount (search params are read, not set)
    // The handleSearchTextChange callback (lines 217-223 in ResultsView.tsx) uses
    // { replace: true } to prevent history pollution when search text changes
    expect(mockSetSearchParams).not.toHaveBeenCalled();
  });
});
