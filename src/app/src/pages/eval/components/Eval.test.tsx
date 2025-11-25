import { callApi } from '@app/utils/api';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from './Eval';
import { useResultsViewSettingsStore, useTableStore } from './store';
import type { EvaluateTable } from '@promptfoo/types';

vi.mock('@app/utils/api');
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
  useResultsViewSettingsStore: vi.fn(),
}));
vi.mock('./FilterModeProvider', () => ({
  useFilterMode: () => ({
    filterMode: 'all',
    setFilterMode: vi.fn(),
  }),
}));
vi.mock('./ResultsView', () => ({
  default: ({ defaultEvalId }: { defaultEvalId: string }) => (
    <div data-testid="results-view" data-default-eval-id={defaultEvalId} />
  ),
}));
vi.mock('@app/components/EnterpriseBanner', () => ({
  default: () => null,
}));
vi.mock('@app/stores/apiConfig', () => ({
  default: () => ({ apiBaseUrl: 'http://localhost' }),
}));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  })),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams()],
    useParams: () => ({}),
  };
});

const mockTable: EvaluateTable = {
  head: { prompts: [], vars: [] },
  body: [],
};

const baseMockTableStore = {
  table: mockTable,
  author: null,
  version: null,
  filteredResultsCount: 0,
  totalResultsCount: 0,
  highlightedResultsCount: 0,
  isFetching: false,
  filters: { values: {} },
  setEvalId: vi.fn(),
  setAuthor: vi.fn(),
  setVersion: vi.fn(),
  setTable: vi.fn(),
  setTableFromResultsFile: vi.fn(),
  setConfig: vi.fn(),
  setFilteredResultsCount: vi.fn(),
  setTotalResultsCount: vi.fn(),
  fetchEvalData: vi
    .fn()
    .mockResolvedValue({ table: mockTable, config: {}, totalCount: 0, filteredCount: 0 }),
  resetFilters: vi.fn(),
  setIsStreaming: vi.fn(),
  addFilter: vi.fn(),
};

// Mock getState and subscribe for the store
(useTableStore as any).getState = vi.fn(() => ({
  filters: { values: {} },
}));
(useTableStore as any).subscribe = vi.fn(() => vi.fn());

describe('Eval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(useResultsViewSettingsStore).mockReturnValue({
      setInComparisonMode: vi.fn(),
      setComparisonEvalIds: vi.fn(),
    });
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should call resetFilters when mounted with a new fetchId', async () => {
    const resetFiltersMock = vi.fn();
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      resetFilters: resetFiltersMock,
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-1" />
        </MemoryRouter>,
      );
    });

    expect(resetFiltersMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-2" />
        </MemoryRouter>,
      );
    });

    expect(resetFiltersMock).toHaveBeenCalledTimes(2);
  });

  it('should call resetFilters only once per render, even with different fetchIds', async () => {
    const resetFiltersMock = vi.fn();
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      resetFilters: resetFiltersMock,
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-1" />
        </MemoryRouter>,
      );
    });

    expect(resetFiltersMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-2" />
        </MemoryRouter>,
      );
    });

    expect(resetFiltersMock).toHaveBeenCalledTimes(2);
  });

  it('should call resetFilters when navigating from one eval to another', async () => {
    const resetFiltersMock = vi.fn();
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      resetFilters: resetFiltersMock,
    });

    const { rerender } = render(
      <MemoryRouter>
        <Eval fetchId="eval-1" />
      </MemoryRouter>,
    );

    expect(resetFiltersMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <MemoryRouter>
          <Eval fetchId="eval-2" />
        </MemoryRouter>,
      );
    });

    expect(resetFiltersMock).toHaveBeenCalledTimes(2);
  });

  it('should not call resetFilters unnecessarily when other dependencies change', async () => {
    const resetFiltersMock = vi.fn();
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      resetFilters: resetFiltersMock,
    });

    const fetchId = 'test-eval-id';

    const { rerender } = render(
      <MemoryRouter>
        <Eval fetchId={fetchId} />
      </MemoryRouter>,
    );

    expect(resetFiltersMock).toHaveBeenCalledTimes(1);
    resetFiltersMock.mockClear();

    await act(async () => {
      rerender(
        <MemoryRouter>
          <Eval fetchId={fetchId} />
        </MemoryRouter>,
      );
    });

    expect(resetFiltersMock).not.toHaveBeenCalled();
  });

  it('should handle null fetchId gracefully without fetching data', async () => {
    const fetchEvalDataMock = vi.fn().mockResolvedValue({ table: mockTable, config: {} });
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      fetchEvalData: fetchEvalDataMock,
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId={null} />
        </MemoryRouter>,
      );
    });

    expect(fetchEvalDataMock).not.toHaveBeenCalled();
  });

  it('should not show empty state while waiting for table construction', async () => {
    // Simulate a successful loadEvalById but table not yet constructed
    const fetchEvalDataMock = vi
      .fn()
      .mockResolvedValue({ table: mockTable, config: {}, totalCount: 0, filteredCount: 0 });

    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      table: null, // Table not yet available
      fetchEvalData: fetchEvalDataMock,
    });

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ evalId: 'test-eval' }] }),
    } as Response);

    const { queryByText } = render(
      <MemoryRouter>
        <Eval fetchId="test-eval" />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should show loading state, NOT empty state
    expect(queryByText('Waiting for eval data')).toBeInTheDocument();
    expect(queryByText('Welcome to Promptfoo')).not.toBeInTheDocument();
  });

  it('should show results when table is available', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      table: mockTable, // Table is available
    });

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ evalId: 'test-eval' }] }),
    } as Response);

    const { queryByTestId } = render(
      <MemoryRouter>
        <Eval fetchId="test-eval" />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Should show results view when table exists
    expect(queryByTestId('results-view')).toBeInTheDocument();
  });

  it('should show error state when loadEvalById fails', async () => {
    const fetchEvalDataMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      fetchEvalData: fetchEvalDataMock,
    });

    const { queryByText } = render(
      <MemoryRouter>
        <Eval fetchId="test-eval" />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(queryByText('404 Eval not found')).toBeInTheDocument();
    expect(queryByText('Waiting for eval data')).not.toBeInTheDocument();
  });

  it('should correctly display the most recent eval data when rapidly switching between fetchIds', async () => {
    const fetchEvalDataMock = vi.fn();
    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      fetchEvalData: fetchEvalDataMock,
    });

    const evalData1 = {
      table: { ...mockTable, id: 'table1' },
      config: {},
      totalCount: 0,
      filteredCount: 0,
    };
    const evalData2 = {
      table: { ...mockTable, id: 'table2' },
      config: {},
      totalCount: 0,
      filteredCount: 0,
    };

    fetchEvalDataMock.mockImplementation((id: string) => {
      if (id === 'eval-1') {
        return Promise.resolve(evalData1);
      } else if (id === 'eval-2') {
        return Promise.resolve(evalData2);
      }
      return Promise.resolve(null);
    });

    const { container } = render(
      <MemoryRouter>
        <Eval fetchId="eval-1" />
      </MemoryRouter>,
    );

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-2" />
        </MemoryRouter>,
        { container },
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const resultsView = container.querySelector('[data-testid="results-view"]');
    expect(resultsView).toBeInTheDocument();
    expect(resultsView?.getAttribute('data-default-eval-id')).toBe('eval-2');
  });
});
