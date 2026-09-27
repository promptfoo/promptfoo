import { act } from 'react';

import { mockCallApiRoutes } from '@app/tests/apiMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import Eval from './Eval';
import { useResultsViewSettingsStore, useTableStore } from './store';

const { filterMode, showToast } = vi.hoisted(() => ({
  filterMode: { current: 'all' as 'all' | 'failures' },
  showToast: vi.fn(),
}));

vi.mock('@app/utils/api', () => ({ callApi: vi.fn(), getApiBaseUrl: vi.fn(() => '') }));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@app/stores/apiConfig', () => ({ default: () => ({ apiBaseUrl: '' }) }));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(), disconnect: vi.fn() }),
}));
vi.mock('./FilterModeProvider', () => ({
  useFilterMode: () => ({ filterMode: filterMode.current, setFilterMode: vi.fn() }),
}));
vi.mock('./ResultsView', async () => {
  const { default: ResultsTable } = await import('./ResultsTable');
  const tableProps = {
    columnVisibility: {},
    failureFilter: {},
    maxTextLength: 100,
    onFailureFilterToggle: vi.fn(),
    showStats: false,
    wordBreak: 'break-word' as const,
    zoom: 1,
  };
  return {
    default: () => (
      <ResultsTable
        {...tableProps}
        key={useTableStore((state) => state.evalId)}
        filterMode={filterMode.current}
      />
    ),
  };
});

const initialTableState = useTableStore.getState();
const initialViewState = useResultsViewSettingsStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useTableStore.setState(initialTableState, true);
  useResultsViewSettingsStore.setState(initialViewState, true);
  filterMode.current = 'all';
});

it('keeps the eval visible when a child filter request supersedes the parent load', async () => {
  const pending: Array<(body: unknown) => void> = [];
  mockCallApiRoutes([
    {
      path: /^\/(?:results(?:\?|$)|eval\/eval-id\/table(?:\?|$))/,
      repeat: true,
      response: (url: string) =>
        url.startsWith('/results')
          ? { data: [{ evalId: 'eval-id' }] }
          : new Promise((resolve) => pending.push(resolve)),
    },
  ]);
  const resolveTableRequests = async () => {
    while (pending.length > 0) {
      await act(async () => {
        for (const resolve of pending.splice(0)) {
          resolve({
            table: { head: { prompts: [], vars: [] }, body: [] },
            config: {},
            version: 4,
            totalCount: 0,
            filteredCount: 0,
          });
        }
      });
    }
  };
  const element = () => (
    <MemoryRouter>
      <Eval fetchId="eval-id" />
    </MemoryRouter>
  );
  const rendered = renderWithProviders(element());
  await resolveTableRequests();
  expect(useTableStore.getState().table).not.toBeNull();

  filterMode.current = 'failures';
  rendered.rerender(element());
  expect(pending.length).toBeGreaterThan(1);
  await resolveTableRequests();

  expect(screen.queryByText('404 Eval not found')).not.toBeInTheDocument();
  expect(useTableStore.getState().tableQuery?.url).toContain('filterMode=failures');
  expect(useTableStore.getState().isFetching).toBe(false);
  expect(rendered.container.querySelector('table.results-table')).not.toBeNull();
});

it('keeps pagination aligned with the initial request when navigating from a small eval', async () => {
  const user = userEvent.setup();
  const requests: string[] = [];
  const pendingLarge: Array<() => void> = [];
  let holdLarge = true;
  mockCallApiRoutes([
    {
      path: /^\/(?:results$|eval\/(small|large)\/table\?)/,
      repeat: true,
      response: (url: string) => {
        if (url === '/results') {
          return { data: [{ evalId: 'small' }, { evalId: 'large' }] };
        }
        requests.push(url);
        const parsed = new URL(url, window.location.origin);
        const id = parsed.pathname.split('/')[2];
        const count = id === 'small' ? 2 : 80;
        const offset = Number(parsed.searchParams.get('offset'));
        const limit = Number(parsed.searchParams.get('limit'));
        const payload = {
          table: {
            head: { prompts: [], vars: ['case'] },
            body: Array.from({ length: Math.min(limit, count - offset) }, (_, index) => ({
              outputs: [],
              test: {},
              testIdx: offset + index,
              vars: [`${id} row ${offset + index}`],
            })),
          },
          config: {},
          version: 4,
          totalCount: count,
          filteredCount: count,
        };
        return id === 'large' && holdLarge
          ? new Promise((resolve) => pendingLarge.push(() => resolve(payload)))
          : payload;
      },
    },
  ]);
  const element = (id: string) => (
    <MemoryRouter>
      <Eval fetchId={id} />
    </MemoryRouter>
  );
  const rendered = renderWithProviders(element('small'));
  await screen.findByText('small row 0');
  rendered.rerender(element('large'));
  await waitFor(() => expect(pendingLarge.length).toBeGreaterThan(0));
  await act(async () => {
    holdLarge = false;
    pendingLarge.forEach((resolve) => resolve());
  });
  await screen.findByText('large row 49');
  expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(50);
  expect(screen.getByLabelText('Results per page')).toHaveTextContent('50');

  requests.length = 0;
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('large row 50');
  expect(requests).toHaveLength(1);
  const query = new URL(requests[0], window.location.origin).searchParams;
  expect(query.get('offset')).toBe('50');
  expect(query.get('limit')).toBe('50');
  expect(screen.getByLabelText('Go to page')).toHaveValue(2);
});
