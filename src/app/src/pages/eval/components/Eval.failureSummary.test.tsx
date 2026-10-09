import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from './Eval';
import { FailureSummary } from './FailureSummary';
import FilterModeProvider, { useFilterMode } from './FilterModeProvider';
import { useTableStore } from './store';

const { socketHandlers } = vi.hoisted(() => ({
  socketHandlers: new Map<string, (data: { evalId: string }) => Promise<void>>(),
}));
vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@app/stores/apiConfig', () => ({ default: () => ({ apiBaseUrl: '' }) }));
vi.mock('@app/constants', () => ({ IS_RUNNING_LOCALLY: true }));
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = {
      on: (event: string, handler: (data: { evalId: string }) => Promise<void>) => {
        socketHandlers.set(event, handler);
        return socket;
      },
      disconnect: vi.fn(),
    };
    return socket;
  },
}));
vi.mock('./ResultsView', () => ({
  default: ({ onRecentEvalSelected }: { onRecentEvalSelected: (id: string) => void }) => {
    const evalId = useTableStore((state) => state.evalId);
    const { filterMode } = useFilterMode();
    return (
      <>
        <p>Mode: {filterMode}</p>
        <button type="button" onClick={() => onRecentEvalSelected('eval-b')}>
          Next eval
        </button>
        {evalId && <FailureSummary key={evalId} evalId={evalId} />}
      </>
    );
  },
}));

const initialState = useTableStore.getState();
const table = { head: { prompts: [], vars: [] }, body: [] };
let summaryRequests: string[];
let tableRequests: URL[];
function Page() {
  const { id } = useParams();
  return <Eval fetchId={id ?? null} />;
}
function mount(search = '?mode=passes&rowId=old') {
  window.history.replaceState(null, '', `/eval/eval-a${search}`);
  return render(
    <BrowserRouter>
      <FilterModeProvider>
        <TooltipProvider>
          <Routes>
            <Route path="/eval/:id" element={<Page />} />
          </Routes>
        </TooltipProvider>
      </FilterModeProvider>
    </BrowserRouter>,
  );
}

describe('failure groups with real router and store', () => {
  beforeEach(() => {
    useTableStore.setState(initialState);
    resetCallApiMock();
    socketHandlers.clear();
    summaryRequests = [];
    tableRequests = [];
    mockCallApiRoutes([
      {
        path: /^(?:\/results$|\/eval\/eval-[ab]\/(?:table\?|failure-summary$))/,
        repeat: true,
        response: (path: string) => {
          if (path === '/results') {
            return { data: [{ evalId: 'eval-a' }, { evalId: 'eval-b' }] };
          }
          if (path.endsWith('/failure-summary')) {
            summaryRequests.push(path);
            return {
              failures: [
                {
                  id: path.includes('eval-a') ? 'a'.repeat(64) : 'b'.repeat(64),
                  error: 'Timeout',
                  count: 2,
                },
              ],
              hasMore: false,
            };
          }
          tableRequests.push(new URL(path, window.location.origin));
          return { table, config: {}, version: 4, totalCount: 2, filteredCount: 2 };
        },
      },
    ]);
  });
  afterEach(() => {
    cleanup();
    useTableStore.setState(initialState);
    window.history.replaceState(null, '', '/');
    vi.clearAllMocks();
  });

  it('changes passes mode and group in the same navigation, then clears the group on eval selection', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: '2 failures: Timeout' }));
    await screen.findByText('Mode: all');
    await waitFor(() =>
      expect(tableRequests[tableRequests.length - 1]?.searchParams.get('filterMode')).toBe('all'),
    );
    const filters = JSON.parse(new URLSearchParams(window.location.search).get('filter')!);
    expect(filters).toEqual([
      expect.objectContaining({ type: 'error', value: 'a'.repeat(64), evalId: 'eval-a' }),
    ]);
    expect(new URLSearchParams(window.location.search).has('rowId')).toBe(false);
    expect(
      JSON.parse(tableRequests[tableRequests.length - 1]!.searchParams.get('filter')!),
    ).toMatchObject({
      value: 'a'.repeat(64),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Next eval' }));
    await waitFor(() =>
      expect(tableRequests[tableRequests.length - 1]?.pathname).toBe('/eval/eval-b/table'),
    );
    expect(
      tableRequests
        .filter((url) => url.pathname === '/eval/eval-b/table')
        .every((url) => !url.searchParams.has('filter')),
    ).toBe(true);
    expect(Object.values(useTableStore.getState().filters.values)).toEqual([]);
    expect(new URLSearchParams(window.location.search).has('filter')).toBe(false);
  });

  it('drops a copied group from another eval before the first table request', async () => {
    const filter = [
      {
        id: 'old',
        type: 'error',
        operator: 'equals',
        value: 'b'.repeat(64),
        evalId: 'eval-b',
        sortIndex: 0,
        logicOperator: 'and',
      },
    ];
    mount(`?filter=${encodeURIComponent(JSON.stringify(filter))}`);
    await screen.findByRole('button', { name: '2 failures: Timeout' });
    expect(tableRequests.length).toBeGreaterThan(0);
    expect(tableRequests.every((url) => !url.searchParams.has('filter'))).toBe(true);
    expect(new URLSearchParams(window.location.search).has('filter')).toBe(false);
  });

  it('refreshes on a persisted update without refetching the summary for pagination or search', async () => {
    mount('');
    await screen.findByRole('button', { name: '2 failures: Timeout' });
    expect(summaryRequests).toHaveLength(1);
    await act(async () => {
      await useTableStore.getState().fetchEvalData('eval-a', { pageIndex: 1, searchText: 'hello' });
    });
    expect(summaryRequests).toHaveLength(1);
    await act(async () => {
      await socketHandlers.get('update')?.({ evalId: 'eval-a' });
    });
    await waitFor(() => expect(summaryRequests).toHaveLength(2));
    expect(callApi).toHaveBeenCalled();
  });
});
