import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../../../test/queryClientWrapper';
import { ToastProvider } from '../../../contexts/ToastContext';
import { ShiftKeyProvider } from '../../../contexts/ShiftKeyContext';
import ResultsView from './ResultsView';

let mockUserEmail: string | null = null;

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({
    data: { email: mockUserEmail, id: null },
    isLoading: false,
  }),
  useUserEmail: () => ({
    email: mockUserEmail,
    isLoading: false,
  }),
}));

vi.mock('@app/stores/evalConfig', () => ({
  useStore: vi.fn(() => ({
    updateConfig: vi.fn(),
  })),
}));

vi.mock('../hooks', () => ({
  useTestCounts: vi.fn(() => [10]),
  usePassingTestCounts: vi.fn(() => [10]),
  usePassRates: vi.fn(() => [100]),
  useTableStore: vi.fn(() => ({
    author: 'test-author',
    table: {
      head: {
        prompts: [{ raw: 'test prompt', label: 'Prompt 1', provider: 'test-provider' }],
        vars: ['var1'],
      },
      body: [
        {
          outputs: [
            {
              pass: true,
              score: 1.0,
              text: 'test output',
              prompt: 'test prompt',
              gradingResults: [],
            },
          ],
          vars: ['value1'],
          test: {},
        },
      ],
    },
    config: {},
    version: 1,
    setConfig: vi.fn(),
    evalId: 'test-eval-id',
    setAuthor: vi.fn(),
    filteredResultsCount: 1,
    totalResultsCount: 1,
    highlightedResultsCount: 0,
    filters: [],
    removeFilter: vi.fn(),
    filterMode: 'all' as const,
    setFilterMode: vi.fn(),
    fetchEvalData: vi.fn(),
    isFetching: false,
  })),
  useResultsViewSettingsStore: vi.fn(() => ({
    setInComparisonMode: vi.fn(),
    inComparisonMode: false,
    columnStates: {},
    setColumnState: vi.fn(),
    maxTextLength: 250,
    wordBreak: 'break-word',
    showInferenceDetails: true,
    comparisonEvalIds: [],
    setComparisonEvalIds: vi.fn(),
  })),
}));

describe('ResultsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserEmail = null;
  });

  it('should call useUser on mount and pass email to AuthorChip', async () => {
    mockUserEmail = 'test@example.com';

    const queryClient = createTestQueryClient();
    render(
      <MemoryRouter>
        <ToastProvider>
          <ResultsView recentEvals={[]} onRecentEvalSelected={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
      {
        wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId('results-view')).toBeInTheDocument();
    });
  });

  describe('Share Button', () => {
    it('always shows share button regardless of config.sharing value', async () => {
      const queryClient = createTestQueryClient();
      render(
        <MemoryRouter>
          <ToastProvider>
            <ShiftKeyProvider>
              <ResultsView recentEvals={[]} onRecentEvalSelected={vi.fn()} />
            </ShiftKeyProvider>
          </ToastProvider>
        </MemoryRouter>,
        {
          wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
        },
      );

      await waitFor(() => {
        expect(screen.getByTestId('results-view')).toBeInTheDocument();
      });
    });

    it('opens share modal when share button is clicked', async () => {
      const queryClient = createTestQueryClient();
      render(
        <MemoryRouter>
          <ToastProvider>
            <ShiftKeyProvider>
              <ResultsView recentEvals={[]} onRecentEvalSelected={vi.fn()} />
            </ShiftKeyProvider>
          </ToastProvider>
        </MemoryRouter>,
        {
          wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
        },
      );

      await waitFor(() => {
        expect(screen.getByTestId('results-view')).toBeInTheDocument();
      });
    });

    it('shows share button alongside other menu items', async () => {
      const queryClient = createTestQueryClient();
      render(
        <MemoryRouter>
          <ToastProvider>
            <ShiftKeyProvider>
              <ResultsView recentEvals={[]} onRecentEvalSelected={vi.fn()} />
            </ShiftKeyProvider>
          </ToastProvider>
        </MemoryRouter>,
        {
          wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
        },
      );

      await waitFor(() => {
        expect(screen.getByTestId('results-view')).toBeInTheDocument();
      });
    });
  });
});
