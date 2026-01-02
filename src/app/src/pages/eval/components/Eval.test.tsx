import { callApi } from '@app/utils/api';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from './Eval';
import { useResultsViewSettingsStore, useTableStore } from './store';
import type { EvaluateTable } from '@promptfoo/types';

const { mockSetSearchParams, mockShowToast } = vi.hoisted(() => ({
  mockSetSearchParams: vi.fn(),
  mockShowToast: vi.fn(),
}));

vi.mock('@app/utils/api');
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
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
    useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
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

// Stable mock for useResultsViewSettingsStore to prevent infinite loops
const baseMockResultsViewSettings = {
  setInComparisonMode: vi.fn(),
  setComparisonEvalIds: vi.fn(),
};

// Mock getState and subscribe for the store
(useTableStore as any).getState = vi.fn(() => ({
  filters: { values: {} },
  resetFilters: baseMockTableStore.resetFilters,
  addFilter: baseMockTableStore.addFilter,
}));
(useTableStore as any).subscribe = vi.fn(() => vi.fn());

describe('Eval', () => {
  beforeEach(() => {
    // Clear specific mocks instead of all mocks to preserve getState
    baseMockTableStore.resetFilters.mockClear();
    baseMockTableStore.addFilter.mockClear();
    baseMockTableStore.fetchEvalData.mockClear();
    baseMockTableStore.setEvalId.mockClear();
    baseMockTableStore.setAuthor.mockClear();
    baseMockTableStore.setVersion.mockClear();
    baseMockTableStore.setTable.mockClear();
    baseMockTableStore.setTableFromResultsFile.mockClear();
    baseMockTableStore.setConfig.mockClear();
    baseMockTableStore.setFilteredResultsCount.mockClear();
    baseMockTableStore.setTotalResultsCount.mockClear();
    baseMockTableStore.setIsStreaming.mockClear();
    baseMockResultsViewSettings.setInComparisonMode.mockClear();
    baseMockResultsViewSettings.setComparisonEvalIds.mockClear();
    mockShowToast.mockClear();

    vi.useFakeTimers();

    // Use stable mock to prevent infinite loops
    vi.mocked(useResultsViewSettingsStore).mockReturnValue(baseMockResultsViewSettings);
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
    vi.mocked(useTableStore).mockReturnValue(baseMockTableStore);

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-1" />
        </MemoryRouter>,
      );
    });

    expect(baseMockTableStore.resetFilters).toHaveBeenCalledTimes(1);

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-2" />
        </MemoryRouter>,
      );
    });

    expect(baseMockTableStore.resetFilters).toHaveBeenCalledTimes(2);
  });

  it('should call resetFilters only once per render, even with different fetchIds', async () => {
    vi.mocked(useTableStore).mockReturnValue(baseMockTableStore);

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-1" />
        </MemoryRouter>,
      );
    });

    expect(baseMockTableStore.resetFilters).toHaveBeenCalledTimes(1);

    await act(async () => {
      render(
        <MemoryRouter>
          <Eval fetchId="eval-2" />
        </MemoryRouter>,
      );
    });

    expect(baseMockTableStore.resetFilters).toHaveBeenCalledTimes(2);
  });

  it('should call resetFilters when navigating from one eval to another', async () => {
    vi.mocked(useTableStore).mockReturnValue(baseMockTableStore);

    const { rerender } = render(
      <MemoryRouter>
        <Eval fetchId="eval-1" />
      </MemoryRouter>,
    );

    expect(baseMockTableStore.resetFilters).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <MemoryRouter>
          <Eval fetchId="eval-2" />
        </MemoryRouter>,
      );
    });

    expect(baseMockTableStore.resetFilters).toHaveBeenCalledTimes(2);
  });

  it('should not call resetFilters unnecessarily when other dependencies change', async () => {
    vi.mocked(useTableStore).mockReturnValue(baseMockTableStore);

    const fetchId = 'test-eval-id';

    const { rerender } = render(
      <MemoryRouter>
        <Eval fetchId={fetchId} />
      </MemoryRouter>,
    );

    expect(baseMockTableStore.resetFilters).toHaveBeenCalledTimes(1);
    baseMockTableStore.resetFilters.mockClear();

    await act(async () => {
      rerender(
        <MemoryRouter>
          <Eval fetchId={fetchId} />
        </MemoryRouter>,
      );
    });

    expect(baseMockTableStore.resetFilters).not.toHaveBeenCalled();
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

  it('should call setSearchParams with { replace: true } when clearing filters', async () => {
    let subscriptionCallback: ((filters: any) => void) | null = null;

    // Mock subscribe to capture the callback and trigger it
    (useTableStore as any).subscribe = vi.fn((selector, callback) => {
      if (selector.toString().includes('filters')) {
        subscriptionCallback = callback;
      }
      return vi.fn(); // unsubscribe function
    });

    const mockFilters = {
      values: {},
      appliedCount: 0, // Filters cleared
    };

    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      filters: mockFilters,
    });

    mockSetSearchParams.mockClear();

    render(
      <MemoryRouter>
        <Eval fetchId="test-eval" />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Trigger the subscription callback manually
    if (subscriptionCallback) {
      await act(async () => {
        subscriptionCallback!(mockFilters);
      });
    }

    // Should call setSearchParams with replace: true when clearing filters
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function), { replace: true });
  });

  it('should call setSearchParams with { replace: true } when applying filters', async () => {
    let subscriptionCallback: ((filters: any) => void) | null = null;

    // Mock subscribe to capture the callback and trigger it
    (useTableStore as any).subscribe = vi.fn((selector, callback) => {
      if (selector.toString().includes('filters')) {
        subscriptionCallback = callback;
      }
      return vi.fn(); // unsubscribe function
    });

    const mockFilters = {
      values: {
        filter1: {
          id: 'filter1',
          type: 'text' as const,
          operator: 'contains' as const,
          value: 'test',
          field: 'text',
          logicOperator: 'and' as const,
          sortIndex: 0,
        },
      },
      appliedCount: 1,
    };

    vi.mocked(useTableStore).mockReturnValue({
      ...baseMockTableStore,
      filters: mockFilters,
    });

    mockSetSearchParams.mockClear();

    render(
      <MemoryRouter>
        <Eval fetchId="test-eval" />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Trigger the subscription callback manually
    if (subscriptionCallback) {
      await act(async () => {
        subscriptionCallback!(mockFilters);
      });
    }

    // Should call setSearchParams with replace: true when applying filters
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function), { replace: true });
  });
});
