import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ResultsView from './ResultsView';
import type { ResultLightweightWithLabel } from '@promptfoo/types';

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

vi.mock('./store', () => ({
  useResultsViewSettingsStore: () => ({
    setInComparisonMode: vi.fn(),
    columnStates: {},
    setColumnState: vi.fn(),
    maxTextLength: 100,
    wordBreak: 'break-word',
    showInferenceDetails: true,
    comparisonEvalIds: [],
    setComparisonEvalIds: vi.fn(),
  }),
  useTableStore: () => ({
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
      sharing: true, // Explicitly enabled
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
  }),
}));

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
    id: 'eval-1',
    label: 'Evaluation 1',
    createdAt: '2023-01-01T00:00:00Z',
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
