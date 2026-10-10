import { createMockResponse, getCallApiMock } from '@app/tests/apiMocks';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from './Eval';
import { useResultsViewSettingsStore, useTableStore } from './store';

// The hosted app has no eval id on its root route and loads the most recent eval instead.
vi.mock('@app/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/constants')>()),
  IS_RUNNING_LOCALLY: false,
}));
vi.mock('@app/utils/api');
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('./store', () => ({
  useTableStore: vi.fn(),
  useResultsViewSettingsStore: vi.fn(),
}));
vi.mock('./FilterModeProvider', () => ({
  useFilterMode: () => ({ filterMode: 'all', setFilterMode: vi.fn() }),
}));
vi.mock('./ResultsView', () => ({
  default: () => <div data-testid="results-view" />,
}));
vi.mock('@app/components/EnterpriseBanner', () => ({
  default: () => null,
}));
vi.mock('@app/stores/apiConfig', () => ({
  default: () => ({ apiBaseUrl: 'http://localhost' }),
}));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ on: vi.fn().mockReturnThis(), disconnect: vi.fn() })),
}));

const table = { head: { prompts: [], vars: [] }, body: [] };

describe('Eval on the hosted root route', () => {
  const fetchEvalData = vi.fn();
  const setTable = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    fetchEvalData.mockResolvedValue({ table, config: {}, totalCount: 0, filteredCount: 0 });
    vi.mocked(useTableStore).mockReturnValue({
      table,
      isFetching: false,
      filters: { values: {} },
      setEvalId: vi.fn(),
      setAuthor: vi.fn(),
      setVersion: vi.fn(),
      setTable,
      setConfig: vi.fn(),
      setFilteredResultsCount: vi.fn(),
      setTotalResultsCount: vi.fn(),
      setIsStreaming: vi.fn(),
      fetchEvalData,
    });
    (useTableStore as any).getState = vi.fn(() => ({
      filters: { values: {} },
      resetFilters: vi.fn(),
      addFilter: vi.fn(),
    }));
    (useTableStore as any).subscribe = vi.fn(() => vi.fn());
    vi.mocked(useResultsViewSettingsStore).mockReturnValue({
      setInComparisonMode: vi.fn(),
      setComparisonEvalIds: vi.fn(),
    });
  });

  it.each([
    ['a list of evals', () => createMockResponse({ data: [{ evalId: 'latest-eval' }] })],
    ['no evals', () => createMockResponse({ data: [] })],
    ['an error', () => createMockResponse({}, { ok: false, status: 500 })],
  ])(
    'leaves a route that replaced it alone when the recent evals arrive with %s',
    async (_name, createResponse) => {
      let respond!: (response: Response) => void;
      getCallApiMock().mockImplementation((url: string) =>
        url === '/results'
          ? new Promise<Response>((resolve) => {
              respond = resolve;
            })
          : Promise.resolve(createMockResponse({ data: [] })),
      );

      const { container, queryByText } = render(
        <MemoryRouter>
          <Eval fetchId={null} />
        </MemoryRouter>,
      );
      const respondToRootRoute = respond;
      // The user opens a specific eval while the root route is still asking for the latest.
      await act(async () => {
        render(
          <MemoryRouter>
            <Eval fetchId="pinned-eval" />
          </MemoryRouter>,
          { container },
        );
      });
      expect(fetchEvalData).toHaveBeenCalledTimes(1);
      expect(fetchEvalData).toHaveBeenCalledWith('pinned-eval', expect.anything());
      setTable.mockClear();

      await act(async () => {
        respondToRootRoute(createResponse());
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // The root route must not load the latest eval over the pinned one, clear the page,
      // or mark it as failed.
      expect(fetchEvalData).toHaveBeenCalledTimes(1);
      expect(setTable).not.toHaveBeenCalled();
      expect(queryByText('404 Eval not found')).not.toBeInTheDocument();
    },
  );
});
