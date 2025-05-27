import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { ToastProvider } from '@app/contexts/ToastContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mock the router hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  };
});

// Mock the store hooks
vi.mock('./store', () => ({
  useTableStore: vi.fn(() => ({
    table: {
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
    },
    setTable: vi.fn(),
    config: { description: 'Test Config' },
    setConfig: vi.fn(),
    evalId: '1',
    author: 'Test Author',
    recentEvals: mockRecentEvals,
    fetchEvalData: vi.fn(),
    evals: mockRecentEvals,
    setAuthor: vi.fn(),
    filteredResultsCount: 10,
    totalResultsCount: 10,
  })),
  useResultsViewSettingsStore: vi.fn(() => ({
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
  })),
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
  });

  it('renders without crashing', () => {
    renderWithProviders(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );

    // Verify key elements are rendered
    expect(screen.getByText('Table Settings')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
  });
});
