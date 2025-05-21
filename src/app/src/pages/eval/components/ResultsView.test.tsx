import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@app/contexts/ToastContext';
import * as api from '@app/utils/api';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResultsView from './ResultsView';

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

vi.mock('@app/utils/api', () => ({
  ...api,
  callApi: vi.fn(() => {
    JSON.stringify({ data: mockRecentEvals });
  }),
}));

vi.mock('@app/utils/api', async (importOriginal) => ({
  // this is required to partially mock the module
  // https://vitest.dev/guide/mocking.html#mock-part-of-a-module
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApi: vi.fn(() => {
    return {
      ok: true,
      async json() {
        return { data: mockRecentEvals };
      },
    };
  }),
}));

vi.mock('./store', () => ({
  useTableStore: vi.fn().mockImplementation(() => ({
    table: {
      head: { prompts: [], vars: [] },
      body: [],
    },
    setTable: vi.fn(),
    config: {},
    setConfig: vi.fn(),
    evalId: '1',
    author: '',
    recentEvals: mockRecentEvals,
    fetchEvalData: vi.fn(),
    evals: mockRecentEvals,
  })),
  useResultsViewSettingsStore: vi.fn().mockImplementation(() => ({
    stickyHeader: true,
    setStickyHeader: vi.fn(),
    inComparisonMode: false,
    setInComparisonMode: vi.fn(),
    columnStates: { '1': mockColumnState },
    setColumnState: vi.fn(),
  })),
}));

vi.mock('@app/state/evalConfig', () => ({
  useStore: vi.fn(() => ({
    setStateFromConfig: vi.fn(),
  })),
}));

const renderWithToastProvider = (ui: React.ReactNode) => {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
};

describe('ResultsView', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithToastProvider(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );
    expect(screen.getByText('Table Settings')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
  });

  it('shows search query param in input', async () => {
    render(
      <MemoryRouter initialEntries={['/?search=hello_world']}>
        <ToastProvider>
          <ResultsView
            recentEvals={mockRecentEvals}
            onRecentEvalSelected={mockOnRecentEvalSelected}
          />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Description 2')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('hello_world')).toBeInTheDocument();
  });

  it('search parameter is not lost when navigating', async () => {
    render(
      <MemoryRouter initialEntries={['/?search=hello_world']}>
        <ToastProvider>
          <ResultsView
            recentEvals={mockRecentEvals}
            onRecentEvalSelected={mockOnRecentEvalSelected}
          />
        </ToastProvider>
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText('Search or select an eval...');
    act(() => {
      input.focus();
      input.click();
    });

    const links = await screen.findAllByRole('link');
    const eval2Link = links.find((link) => link.getAttribute('href') === '/eval/2');
    if (eval2Link) {
      act(() => {
        eval2Link.click();
      });
      // this assertion doesnt really check the qp but just ensures that the state is correct
      expect(screen.getByDisplayValue('hello_world')).toBeInTheDocument();
      expect(screen.getByText('Description 2')).toBeInTheDocument();
    }
  });
});
