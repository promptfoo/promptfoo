import useApiConfig from '@app/stores/apiConfig';
import {
  getCallApiMock,
  mockCallApiResponse,
  rejectCallApi,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvalPage from '../page';
import { useResultsViewSettingsStore, useTableStore } from './store';

const { socketHandlers, tableFixture } = vi.hoisted(() => ({
  tableFixture: { realTable: false, rowCount: 0 },
  socketHandlers: new Map<string, (data: unknown) => Promise<void>>(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn().mockResolvedValue(null),
}));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(function (this: unknown, event: string, handler: (data: unknown) => Promise<void>) {
      socketHandlers.set(event, handler);
      return this;
    }),
    disconnect: vi.fn(),
  }),
}));
vi.mock('./ResultsTable', async (importOriginal) => {
  const { default: ActualResultsTable } = await importOriginal<typeof import('./ResultsTable')>();
  return {
    default: (props: React.ComponentProps<typeof ActualResultsTable>) => {
      const { table } = useTableStore();
      return tableFixture.realTable ? (
        <ActualResultsTable {...props} />
      ) : (
        <div data-testid="comparison-columns">
          {table?.head.prompts.map((p) => p.label).join(',')}
        </div>
      );
    },
  };
});
vi.mock('./EvalOutputCell', () => ({
  default: ({
    output,
    rowPositionIndex,
  }: {
    output: { text: string };
    rowPositionIndex: number;
  }) => (
    <span data-testid="output" data-row-position={rowPositionIndex}>
      {output.text}
    </span>
  ),
}));
vi.mock('./ResultsCharts', () => ({ default: () => null }));
vi.mock('@app/pages/redteam/report/components/Report', () => ({
  default: () => <div data-testid="report">Report</div>,
}));
vi.mock('./ResultsFilters/FiltersForm', () => ({ default: () => null }));
vi.mock('./ShareModal', () => ({ default: () => null }));
vi.mock('./ConfigModal', () => ({ default: () => null }));
vi.mock('./DownloadMenu', () => ({ DownloadMenuItem: () => null, DownloadDialog: () => null }));
vi.mock('./TableSettings/TableSettingsModal', () => ({ default: () => null }));
vi.mock('./EvalSelectorDialog', () => ({
  default: ({ open, onEvalSelected }: { open: boolean; onEvalSelected: (id: string) => void }) =>
    open ? <button onClick={() => onEvalSelected('eval-b')}>Select comparison B</button> : null,
}));

const initialTableState = useTableStore.getState();
const initialSettings = useResultsViewSettingsStore.getState();
const initialApiConfig = useApiConfig.getState();

function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/eval/eval-c?comparisonEvalIds=eval-d&search=second')}>
        Other comparison
      </button>
      <button onClick={() => navigate('/eval/eval-c')}>Other eval</button>
      <button onClick={() => navigate('/eval')}>Latest eval</button>
      <button onClick={() => navigate('/eval/eval-a?comparisonEvalIds=deleted')}>
        Invalid comparison
      </button>
      <button
        onClick={() =>
          navigate(
            `/eval/eval-a?mode=failures&filter=${encodeURIComponent(JSON.stringify([{ id: 'report-filter', type: 'plugin', operator: 'equals', value: 'synthetic-plugin', logicOperator: 'and', sortIndex: 0 }]))}`,
          )
        }
      >
        Report logs
      </button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

function renderPage(url: string) {
  window.history.replaceState({}, '', url);
  return renderWithProviders(
    <BrowserRouter>
      <Navigation />
      <Routes>
        <Route path="/eval/:evalId?" element={<EvalPage />} />
      </Routes>
    </BrowserRouter>,
  );
}

function tableRequests() {
  return vi
    .mocked(callApi)
    .mock.calls.map(([url]) => new URL(String(url), window.location.origin))
    .filter((url) => url.pathname.endsWith('/table'));
}

beforeEach(() => {
  resetCallApiMock();
  socketHandlers.clear();
  tableFixture.realTable = false;
  tableFixture.rowCount = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  useTableStore.setState(initialTableState);
  useResultsViewSettingsStore.setState(initialSettings);
  getCallApiMock().mockImplementation(async (path, options) => {
    const url = new URL(String(path), window.location.origin);
    if (
      (options?.method ?? 'GET') !== 'GET' ||
      (url.pathname !== '/results' && !/^\/eval\/[^/]+\/table$/.test(url.pathname))
    ) {
      throw new Error(`Unexpected comparison fixture request: ${options?.method ?? 'GET'} ${path}`);
    }
    if (url.pathname === '/results') {
      return new Response(
        JSON.stringify({
          data: [
            {
              evalId: 'eval-a',
              label: 'Comparison fixture',
              datasetId: 'dataset-a',
              createdAt: 0,
              numTests: 0,
            },
          ],
        }),
      );
    }
    const id = url.pathname.split('/')[2];
    const comparisons = url.searchParams.getAll('comparisonEvalIds');
    if (comparisons.some((value) => ['deleted', 'different-dataset'].includes(value))) {
      return new Response(JSON.stringify({ error: 'Invalid comparison' }), { status: 400 });
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    const count = Math.min(
      Number(url.searchParams.get('limit') || 50),
      Math.max(0, tableFixture.rowCount - offset),
    );
    return new Response(
      JSON.stringify({
        table: {
          head: {
            vars: tableFixture.rowCount ? ['sample'] : [],
            prompts: [id, ...comparisons].map((label) => ({ label, raw: label, provider: 'echo' })),
          },
          body: Array.from({ length: count }, (_, index) => {
            const row = index + offset;
            return {
              testIdx: row,
              test: {},
              vars: [`row-${row}`],
              outputs: [id, ...comparisons].map((evalId) => ({
                id: `${evalId}-${row}`,
                text: `${evalId} row-${row}`,
                pass: true,
                score: 1,
              })),
            };
          }),
        },
        config: { description: 'Comparison fixture' },
        totalCount: tableFixture.rowCount,
        filteredCount: tableFixture.rowCount,
      }),
    );
  });
});

afterEach(() => {
  cleanup();
  useTableStore.setState(initialTableState);
  useResultsViewSettingsStore.setState(initialSettings);
  useApiConfig.setState(initialApiConfig);
  vi.restoreAllMocks();
});

describe('evaluation comparison URLs', () => {
  it('loads a fresh deep link and restores it on remount without persisted settings', async () => {
    const url = '/eval/eval-a?comparisonEvalIds=eval-b&comparisonEvalIds=eval-c';
    const first = renderPage(url);
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b,eval-c'),
    );
    expect(tableRequests()[0].searchParams.getAll('comparisonEvalIds')).toEqual([
      'eval-b',
      'eval-c',
    ]);
    first.unmount();
    act(() => {
      useTableStore.setState(initialTableState);
      useResultsViewSettingsStore.setState(initialSettings);
    });
    renderPage(url);
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b,eval-c'),
    );
    expect(useResultsViewSettingsStore.getState().inComparisonMode).toBe(true);
  });

  it('deduplicates comparisons and ignores self IDs and empty values before fetching', async () => {
    renderPage(
      '/eval/eval-a?comparisonEvalIds=eval-a&comparisonEvalIds=eval-b&comparisonEvalIds=eval-b&comparisonEvalIds=&comparisonEvalIds=%20',
    );
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b'),
    );
    expect(tableRequests()[0].searchParams.getAll('comparisonEvalIds')).toEqual(['eval-b']);
  });

  it('adds and clears a comparison in the URL while preserving search and filters', async () => {
    const user = userEvent.setup();
    const filter = JSON.stringify([
      {
        id: 'filter-1',
        type: 'metric',
        operator: '>=',
        field: 'quality',
        value: '0.5',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ]);
    renderPage(`/eval/eval-a?search=sample&mode=passes&filter=${encodeURIComponent(filter)}`);
    await screen.findByTestId('comparison-columns');
    const historyLength = window.history.length;
    await user.click(screen.getByRole('button', { name: /Eval actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
    await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b'),
    );
    const params = new URLSearchParams(window.location.search);
    expect(params.getAll('comparisonEvalIds')).toEqual(['eval-b']);
    expect(params.get('search')).toBe('sample');
    expect(params.get('mode')).toBe('passes');
    expect(JSON.parse(params.get('filter')!)[0]).toMatchObject({ field: 'quality', value: '0.5' });
    expect(tableRequests()[tableRequests().length - 1].searchParams.get('search')).toBe('sample');
    expect(window.history.length).toBe(historyLength);
    await user.click(screen.getByRole('button', { name: /Eval actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear comparison' }));
    await waitFor(() =>
      expect(useResultsViewSettingsStore.getState().inComparisonMode).toBe(false),
    );
    expect(new URLSearchParams(window.location.search).has('comparisonEvalIds')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('search')).toBe('sample');
    expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-a$/);
  });

  it.each([
    { type: 'metadata', operator: 'exists', field: 'category' },
    { type: 'metric', operator: 'is_defined', field: 'quality' },
  ])('preserves a $type existence filter when loading a comparison', async (filter) => {
    const filters = JSON.stringify([
      { ...filter, id: 'filter-1', value: '', logicOperator: 'and', sortIndex: 0 },
    ]);
    renderPage(`/eval/eval-a?comparisonEvalIds=eval-b&filter=${encodeURIComponent(filters)}`);
    await screen.findByTestId('comparison-columns');
    expect(
      tableRequests()[0]
        .searchParams.getAll('filter')
        .map((value) => JSON.parse(value)),
    ).toEqual([{ ...filter, value: '', logicOperator: 'and' }]);
  });

  it('restores comparison state on back and forward and clears stale state on a plain route', async () => {
    const user = userEvent.setup();
    renderPage('/eval/eval-a?comparisonEvalIds=eval-b&search=first');
    await screen.findByTestId('comparison-columns');
    await user.click(screen.getByRole('button', { name: 'Other comparison' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-c,eval-d'),
    );
    expect(screen.getByRole('searchbox')).toHaveValue('second');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b'),
    );
    expect(screen.getByRole('searchbox')).toHaveValue('first');
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-c,eval-d'),
    );
    await user.click(screen.getByRole('button', { name: 'Other eval' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-c$/),
    );
    expect(useResultsViewSettingsStore.getState().comparisonEvalIds).toEqual([]);
    expect(useResultsViewSettingsStore.getState().inComparisonMode).toBe(false);
  });

  it('clears comparisons when selecting another evaluation and preserves the remaining URL state', async () => {
    const user = userEvent.setup();
    renderPage('/eval/eval-a?comparisonEvalIds=eval-b&search=sample');
    await screen.findByTestId('comparison-columns');
    await user.click(screen.getByText('Comparison fixture', { selector: 'span' }));
    await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-b$/),
    );
    expect(window.location.pathname).toBe('/eval/eval-b');
    expect(window.location.search).toBe('?search=sample');
  });

  it('pins a comparison started on the latest-eval route to its base evaluation', async () => {
    const user = userEvent.setup();
    renderPage('/eval');
    await act(async () => {
      await socketHandlers.get('init')!({ evalId: 'eval-a' });
    });
    await screen.findByTestId('comparison-columns');
    await user.click(screen.getByRole('button', { name: /Eval actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
    await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b'),
    );
    expect(window.location.pathname).toBe('/eval/eval-a');
    expect(new URLSearchParams(window.location.search).getAll('comparisonEvalIds')).toEqual([
      'eval-b',
    ]);
  });

  it.each([50, 10])(
    'keeps comparison rows aligned with page 2 at page size %s',
    async (pageSize) => {
      tableFixture.realTable = true;
      tableFixture.rowCount = 120;
      const user = userEvent.setup();
      renderPage('/eval/eval-a');
      await screen.findByText('eval-a row-0');
      if (pageSize !== 50) {
        await user.click(screen.getByRole('combobox', { name: 'Results per page' }));
        await user.click(screen.getByRole('option', { name: String(pageSize) }));
      }
      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await screen.findByText(`eval-a row-${pageSize}`);
      await user.click(screen.getByRole('button', { name: /Eval actions/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
      await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
      await screen.findByText(`eval-b row-${pageSize}`);
      expect(screen.queryByText('eval-b row-0')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('output')).toHaveLength(pageSize * 2);
      expect(screen.getByRole('spinbutton', { name: 'Go to page' })).toHaveValue(2);
      await user.click(screen.getByRole('button', { name: /Eval actions/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Clear comparison' }));
      await waitFor(() => expect(screen.getAllByTestId('output')).toHaveLength(pageSize));
      expect(screen.getByText(`eval-a row-${pageSize}`)).toBeInTheDocument();
      expect(screen.queryByText('eval-a row-0')).not.toBeInTheDocument();
    },
  );

  it.each(['', '?comparisonEvalIds=eval-b'])(
    'keeps unchanged socket refreshes in the background (%s)',
    async (search) => {
      tableFixture.realTable = true;
      tableFixture.rowCount = 120;
      renderPage(`/eval/eval-a${search}`);
      await screen.findByText('eval-a row-0');
      await waitFor(() => expect(useTableStore.getState().isFetching).toBe(false));
      const defaultApi = getCallApiMock().getMockImplementation()!;
      const pending: (() => Promise<void>)[] = [];
      vi.mocked(callApi).mockClear();
      getCallApiMock().mockImplementation((path, options) => {
        if (String(path).startsWith('/eval/eval-a/table')) {
          return new Promise((resolve) => {
            pending.push(async () => {
              resolve(await defaultApi(path, options));
            });
          });
        }
        return defaultApi(path, options);
      });
      let refresh!: Promise<void>;
      await act(async () => {
        refresh = socketHandlers.get('update')!({ evalId: 'eval-a' });
      });
      const requestCount = tableRequests().length;
      const isFetching = useTableStore.getState().isFetching;
      await act(async () => {
        await Promise.all(pending.map((finish) => finish()));
        await refresh;
      });
      expect(requestCount).toBe(1);
      expect(isFetching).toBe(false);
      expect(useTableStore.getState().isFetching).toBe(false);
    },
  );

  it('reloads the latest route without retaining compared columns', async () => {
    tableFixture.realTable = true;
    tableFixture.rowCount = 120;
    const user = userEvent.setup();
    renderPage('/eval/eval-a?comparisonEvalIds=eval-b');
    await screen.findByText('eval-b row-0');
    await user.click(screen.getByRole('button', { name: 'Latest eval' }));
    await waitFor(() => expect(screen.getAllByTestId('output')).toHaveLength(50));
    expect(screen.queryByText('eval-b row-0')).not.toBeInTheDocument();
    expect(useResultsViewSettingsStore.getState().comparisonEvalIds).toEqual([]);
  });

  it('recovers a failed comparison on the local latest-eval route', async () => {
    const user = userEvent.setup();
    renderPage('/eval?comparisonEvalIds=deleted');
    await act(async () => {
      await socketHandlers.get('init')!({ evalId: 'eval-a' });
    });
    await screen.findByText(/Unable to load comparison/);
    await user.click(screen.getByRole('button', { name: 'Clear comparison' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-a$/),
    );
  });

  it.each(['http', 'network'])(
    'keeps the loaded latest evaluation when a filter change cannot refresh recents (%s)',
    async (failure) => {
      tableFixture.realTable = true;
      tableFixture.rowCount = 120;
      const user = userEvent.setup();
      renderPage('/eval');
      await screen.findByText('eval-a row-0');
      await user.click(screen.getByRole('combobox', { name: 'Results per page' }));
      await user.click(screen.getByRole('option', { name: '10' }));
      await waitFor(() => expect(screen.getAllByTestId('output')).toHaveLength(10));
      const defaultApi = getCallApiMock().getMockImplementation()!;
      getCallApiMock().mockImplementation((path, options) => {
        if (path === '/results') {
          return failure === 'http'
            ? Promise.resolve(new Response(null, { status: 503 }))
            : Promise.reject(new Error('Network unavailable'));
        }
        return defaultApi(path, options);
      });
      await user.click(screen.getByRole('button', { name: 'Passes' }));
      await waitFor(() => expect(useTableStore.getState().isFetching).toBe(false));
      const requests = tableRequests();
      expect(requests[requests.length - 1].searchParams.get('filterMode')).toBe('passes');
      expect(requests[requests.length - 1].searchParams.get('limit')).toBe('10');
      expect(screen.queryByText('404 Eval not found')).not.toBeInTheDocument();
      expect(screen.getByText('eval-a row-0')).toBeInTheDocument();
      expect(screen.getAllByTestId('output')).toHaveLength(10);
    },
  );

  it.each(['/eval', '/eval/eval-a'])(
    'does not retain another API server’s results after a failed server switch on %s',
    async (route) => {
      renderPage(route);
      await screen.findByTestId('comparison-columns');
      await waitFor(() => expect(useTableStore.getState().isFetching).toBe(false));
      mockCallApiResponse(null, { status: 404 });
      await act(async () => {
        useApiConfig.getState().setApiBaseUrl('http://other-api.example');
      });
      await screen.findByText('404 Eval not found');
      expect(screen.queryByTestId('comparison-columns')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Eval actions/ })).not.toBeInTheDocument();
    },
  );

  it.each(['http', 'network', 'empty'])(
    'keeps initial unavailable and empty latest-evaluation lookups distinct (%s)',
    async (outcome) => {
      getCallApiMock().mockImplementation(() =>
        outcome === 'network'
          ? Promise.reject(new Error('Network unavailable'))
          : Promise.resolve(
              outcome === 'http'
                ? new Response(null, { status: 503 })
                : new Response(JSON.stringify({ data: [] })),
            ),
      );
      renderPage('/eval');
      await screen.findByText(outcome === 'empty' ? 'Welcome to Promptfoo' : '404 Eval not found');
      expect(tableRequests()).toHaveLength(0);
    },
  );

  it('preserves custom page size when changing filter mode', async () => {
    tableFixture.realTable = true;
    tableFixture.rowCount = 120;
    const user = userEvent.setup();
    renderPage('/eval/eval-a');
    await screen.findByText('eval-a row-0');
    await user.click(screen.getByRole('combobox', { name: 'Results per page' }));
    await user.click(screen.getByRole('option', { name: '10' }));
    await waitFor(() => expect(screen.getAllByTestId('output')).toHaveLength(10));
    await user.click(screen.getByRole('button', { name: 'Passes' }));
    await waitFor(() => expect(useTableStore.getState().isFetching).toBe(false));
    expect(screen.getAllByTestId('output')).toHaveLength(10);
    expect(screen.getByRole('combobox', { name: 'Results per page' })).toHaveTextContent('10');
  });

  it.each([
    { parentStatus: 500, pageStatus: 200 },
    { parentStatus: 200, pageStatus: 500 },
  ])(
    'uses the latest page outcome when parent=$parentStatus and page=$pageStatus',
    async ({ parentStatus, pageStatus }) => {
      tableFixture.realTable = true;
      tableFixture.rowCount = 120;
      const user = userEvent.setup();
      renderPage('/eval/eval-a');
      await screen.findByText('eval-a row-0');
      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await screen.findByText('eval-a row-50');
      const defaultApi = getCallApiMock().getMockImplementation()!;
      let finishParent!: (response: Response) => void;
      let comparisonRequests = 0;
      getCallApiMock().mockImplementation((path, options) => {
        const url = new URL(String(path), window.location.origin);
        if (url.pathname === '/eval/eval-a/table' && url.searchParams.has('comparisonEvalIds')) {
          if (++comparisonRequests === 1) {
            return new Promise((resolve) => {
              finishParent = resolve;
            });
          }
          if (pageStatus !== 200) {
            return Promise.resolve(new Response(null, { status: pageStatus }));
          }
        }
        return defaultApi(path, options);
      });
      await user.click(screen.getByRole('button', { name: /Eval actions/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
      await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
      if (pageStatus === 200) {
        await screen.findByText('eval-b row-50');
      } else {
        await screen.findByText(/Unable to load comparison/);
      }
      await act(async () => {
        finishParent(
          parentStatus === 200
            ? await defaultApi('/eval/eval-a/table?comparisonEvalIds=eval-b')
            : new Response(null, { status: parentStatus }),
        );
      });
      if (pageStatus === 200) {
        expect(screen.getByText('eval-b row-50')).toBeInTheDocument();
        expect(screen.queryByText(/Unable to load comparison/)).not.toBeInTheDocument();
      } else {
        expect(screen.getByText(/Unable to load comparison/)).toBeInTheDocument();
      }
    },
  );

  it.each([200, 500])(
    'ignores a stale latest-eval response after navigating to a pinned evaluation (%s)',
    async (status) => {
      const user = userEvent.setup();
      const defaultApi = getCallApiMock().getMockImplementation()!;
      let finishRecents!: (response: Response) => void;
      let deferred = false;
      getCallApiMock().mockImplementation((path, options) => {
        if (path === '/results' && !deferred) {
          deferred = true;
          return new Promise((resolve) => {
            finishRecents = resolve;
          });
        }
        return defaultApi(path, options);
      });
      renderPage('/eval');
      await user.click(screen.getByRole('button', { name: 'Other eval' }));
      await waitFor(() =>
        expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-c$/),
      );
      await act(async () => {
        finishRecents(
          status === 200 ? await defaultApi('/results') : new Response(null, { status }),
        );
      });
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-c$/);
    },
  );

  it.each([200, 500])(
    'ignores an older latest-eval lookup after a socket load (%s)',
    async (status) => {
      const defaultApi = getCallApiMock().getMockImplementation()!;
      let finishRecents!: (response: Response) => void;
      let deferred = false;
      getCallApiMock().mockImplementation((path, options) => {
        if (path === '/results') {
          if (!deferred) {
            deferred = true;
            return new Promise((resolve) => {
              finishRecents = resolve;
            });
          }
          return Promise.resolve(new Response(JSON.stringify({ data: [{ evalId: 'eval-b' }] })));
        }
        return defaultApi(path, options);
      });
      renderPage('/eval');
      await act(async () => {
        await socketHandlers.get('update')!({ evalId: 'eval-b' });
      });
      await waitFor(() =>
        expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-b$/),
      );
      await act(async () => {
        finishRecents(
          status === 200 ? await defaultApi('/results') : new Response(null, { status }),
        );
      });
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-b$/);
    },
  );

  it('shows a recoverable load error when the latest-eval lookup rejects', async () => {
    rejectCallApi(new Error('Network unavailable'));
    renderPage('/eval');
    expect(await screen.findByText('404 Eval not found')).toBeInTheDocument();
  });

  it('hydrates filters when opening same-eval logs from the report', async () => {
    const user = userEvent.setup();
    renderPage('/eval/eval-a?view=report');
    await screen.findByTestId('report');
    vi.mocked(callApi).mockClear();
    await user.click(screen.getByRole('button', { name: 'Report logs' }));
    await screen.findByTestId('comparison-columns');
    await waitFor(() => expect(tableRequests().length).toBeGreaterThan(0));
    const request = tableRequests()[tableRequests().length - 1];
    expect(request.searchParams.get('filterMode')).toBe('failures');
    expect(request.searchParams.getAll('filter').map((filter) => JSON.parse(filter))).toEqual([
      expect.objectContaining({ type: 'plugin', operator: 'equals', value: 'synthetic-plugin' }),
    ]);
  });

  it('forwards legacy metric filters without a field in saved URLs', async () => {
    const filter = JSON.stringify([
      {
        id: 'legacy-filter',
        type: 'metric',
        operator: 'equals',
        value: 'accuracy',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ]);
    renderPage(`/eval/eval-a?filter=${encodeURIComponent(filter)}`);
    await screen.findByTestId('comparison-columns');
    expect(
      tableRequests()[0]
        .searchParams.getAll('filter')
        .map((value) => JSON.parse(value)),
    ).toEqual([expect.objectContaining({ type: 'metric', operator: 'equals', value: 'accuracy' })]);
  });

  it.each([50, 10])(
    'resets stale pagination after a failed comparison unmounts the table (size %s)',
    async (pageSize) => {
      tableFixture.realTable = true;
      tableFixture.rowCount = 120;
      const user = userEvent.setup();
      renderPage('/eval/eval-a?comparisonEvalIds=eval-b');
      await screen.findByText('eval-b row-0');
      if (pageSize !== 50) {
        await user.click(screen.getByRole('combobox', { name: 'Results per page' }));
        await user.click(screen.getByRole('option', { name: String(pageSize) }));
      }
      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await screen.findByText(`eval-b row-${pageSize}`);
      await user.click(screen.getByRole('button', { name: 'Invalid comparison' }));
      await screen.findByText(/Unable to load comparison/);
      expect(screen.queryByTestId('output')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear comparison' }));
      await screen.findByText('eval-a row-0');
      expect(screen.getAllByTestId('output')).toHaveLength(50);
      expect(screen.getByRole('spinbutton', { name: 'Go to page' })).toHaveValue(1);
      expect(screen.getByRole('combobox', { name: 'Results per page' })).toHaveTextContent('50');
    },
  );

  it('keeps page controls and retries after a transient page failure', async () => {
    tableFixture.realTable = true;
    tableFixture.rowCount = 120;
    const user = userEvent.setup();
    renderPage('/eval/eval-a');
    await screen.findByText('eval-a row-0');
    const defaultApi = getCallApiMock().getMockImplementation()!;
    let failed = false;
    getCallApiMock().mockImplementation((path, options) => {
      const url = new URL(String(path), window.location.origin);
      if (url.pathname.endsWith('/table') && url.searchParams.get('offset') === '50' && !failed) {
        failed = true;
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      return defaultApi(path, options);
    });
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Unable to load results');
    expect(screen.getByRole('combobox', { name: 'Results per page' })).toBeInTheDocument();
    expect(screen.queryByText('404 Eval not found')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('eval-a row-50');
    expect(screen.queryByText('Unable to load results')).not.toBeInTheDocument();
  });

  it('keeps the page-size selector usable after a 413 response', async () => {
    tableFixture.realTable = true;
    tableFixture.rowCount = 120;
    const user = userEvent.setup();
    renderPage('/eval/eval-a');
    await screen.findByText('eval-a row-0');
    const defaultApi = getCallApiMock().getMockImplementation()!;
    getCallApiMock().mockImplementation((path, options) => {
      const url = new URL(String(path), window.location.origin);
      if (url.pathname.endsWith('/table') && url.searchParams.get('limit') === '100') {
        return Promise.resolve(new Response(null, { status: 413 }));
      }
      return defaultApi(path, options);
    });
    await user.click(screen.getByRole('combobox', { name: 'Results per page' }));
    await user.click(screen.getByRole('option', { name: '100' }));
    await screen.findByText('Unable to load results');
    await user.click(screen.getByRole('combobox', { name: 'Results per page' }));
    await user.click(screen.getByRole('option', { name: '10' }));
    await waitFor(() => expect(screen.getAllByTestId('output')).toHaveLength(10));
    expect(screen.queryByText('Unable to load results')).not.toBeInTheDocument();
  });

  it.each([
    { route: '/eval', change: 'comparison' },
    { route: '/eval/eval-a', change: 'comparison' },
    { route: '/eval', change: 'filter' },
    { route: '/eval/eval-a', change: 'filter' },
  ])('ignores a socket lookup superseded by $change on $route', async ({ route, change }) => {
    tableFixture.realTable = true;
    tableFixture.rowCount = 120;
    const user = userEvent.setup();
    renderPage(route);
    await screen.findByText('eval-a row-0');
    const defaultApi = getCallApiMock().getMockImplementation()!;
    let finishRecents!: (response: Response) => void;
    let deferred = false;
    getCallApiMock().mockImplementation((path, options) => {
      if (path === '/results' && !deferred) {
        deferred = true;
        return new Promise((resolve) => {
          finishRecents = resolve;
        });
      }
      return defaultApi(path, options);
    });
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = socketHandlers.get('update')!({});
    });
    if (change === 'comparison') {
      await user.click(screen.getByRole('button', { name: /Eval actions/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
      await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
      await screen.findByText('eval-b row-0');
    } else {
      await user.click(screen.getByRole('button', { name: 'Passes' }));
      await waitFor(() =>
        expect(tableRequests()[tableRequests().length - 1].searchParams.get('filterMode')).toBe(
          'passes',
        ),
      );
    }
    const requestsBeforeRelease = tableRequests().length;
    await act(async () => {
      finishRecents(await defaultApi('/results'));
      await refresh;
    });
    expect(tableRequests()).toHaveLength(requestsBeforeRelease);
    if (change === 'comparison') {
      expect(screen.getByText('eval-b row-0')).toBeInTheDocument();
      expect(useResultsViewSettingsStore.getState().comparisonEvalIds).toEqual(['eval-b']);
      expect(new URLSearchParams(window.location.search).getAll('comparisonEvalIds')).toEqual([
        'eval-b',
      ]);
    } else {
      expect(tableRequests()[tableRequests().length - 1].searchParams.get('filterMode')).toBe(
        'passes',
      );
    }
  });

  it.each([200, 500, 'network'] as const)(
    'does not restore cleared results or errors after a delayed table response (%s)',
    async (outcome) => {
      const defaultApi = getCallApiMock().getMockImplementation()!;
      let finishTable!: (response: Response) => void;
      let failTable!: (reason: Error) => void;
      getCallApiMock().mockImplementation((path, options) => {
        if (String(path).startsWith('/eval/eval-a/table')) {
          return new Promise((resolve, reject) => {
            finishTable = resolve;
            failTable = reject;
          });
        }
        return defaultApi(path, options);
      });
      renderPage('/eval');
      await waitFor(() => expect(finishTable).toEqual(expect.any(Function)));
      await act(async () => {
        await socketHandlers.get('update')!(null);
      });
      const loadingAfterClear = useTableStore.getState().isFetching;
      await act(async () => {
        if (outcome === 'network') {
          failTable(new Error('Network unavailable'));
        } else {
          finishTable(
            outcome === 200
              ? await defaultApi('/eval/eval-a/table')
              : new Response(null, { status: outcome }),
          );
        }
      });
      expect(useTableStore.getState()).toMatchObject({
        table: null,
        tableSource: null,
        config: null,
        evalId: '',
        tableError: false,
        isFetching: false,
      });
      expect(loadingAfterClear).toBe(false);
    },
  );

  it.each(['filter', 'comparison'])(
    'reconciles deletion of the current evaluation after a pending $0 change',
    async (change) => {
      tableFixture.realTable = true;
      tableFixture.rowCount = 120;
      const user = userEvent.setup();
      renderPage('/eval/eval-a');
      await screen.findByText('eval-a row-0');
      const defaultApi = getCallApiMock().getMockImplementation()!;
      let finishRecents!: (response: Response) => void;
      let deferred = false;
      getCallApiMock().mockImplementation((path, options) => {
        if (path === '/results' && !deferred) {
          deferred = true;
          return new Promise((resolve) => {
            finishRecents = resolve;
          });
        }
        if (String(path).startsWith('/eval/eval-a/table')) {
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        return defaultApi(path, options);
      });
      let refresh!: Promise<void>;
      await act(async () => {
        refresh = socketHandlers.get('update')!({ deletedEvalIds: ['eval-a'] });
      });
      if (change === 'filter') {
        await user.click(screen.getByRole('button', { name: 'Passes' }));
      } else {
        await user.click(screen.getByRole('button', { name: /Eval actions/ }));
        await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
        await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
      }
      await waitFor(() => expect(useTableStore.getState().tableError).toBe(true));
      await act(async () => {
        finishRecents(new Response(JSON.stringify({ data: [{ evalId: 'eval-c' }] })));
        await refresh;
      });
      await screen.findByText('eval-c row-0');
      expect(window.location.pathname).toBe('/eval/eval-c');
      expect(window.location.search).toBe('');
    },
  );

  it('does not redirect a different evaluation when an older deletion lookup resolves', async () => {
    const user = userEvent.setup();
    renderPage('/eval/eval-a');
    await screen.findByTestId('comparison-columns');
    const defaultApi = getCallApiMock().getMockImplementation()!;
    let finishRecents!: (response: Response) => void;
    let deferred = false;
    getCallApiMock().mockImplementation((path, options) => {
      if (path === '/results' && !deferred) {
        deferred = true;
        return new Promise((resolve) => {
          finishRecents = resolve;
        });
      }
      return defaultApi(path, options);
    });
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = socketHandlers.get('update')!({ deletedEvalIds: ['eval-a'] });
    });
    await user.click(screen.getByRole('button', { name: 'Other eval' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-c$/),
    );
    await act(async () => {
      finishRecents(
        new Response(JSON.stringify({ data: [{ evalId: 'eval-d' }, { evalId: 'eval-c' }] })),
      );
      await refresh;
    });
    expect(window.location.pathname).toBe('/eval/eval-c');
    expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-c$/);
  });

  it.each([200, 404])(
    'keeps the current comparison when an earlier navigation resolves late with %s',
    async (status) => {
      const user = userEvent.setup();
      const defaultApi = getCallApiMock().getMockImplementation()!;
      let finishOldRequest!: (response: Response) => void;
      getCallApiMock().mockImplementation((path, options) => {
        if (String(path).startsWith('/eval/eval-a/table')) {
          return new Promise((resolve) => {
            finishOldRequest = resolve;
          });
        }
        return defaultApi(path, options);
      });
      renderPage('/eval/eval-a?comparisonEvalIds=eval-b');
      await user.click(screen.getByRole('button', { name: 'Other comparison' }));
      await waitFor(() =>
        expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-c,eval-d'),
      );
      await act(async () => {
        finishOldRequest(
          status === 200
            ? await defaultApi('/eval/eval-a/table?comparisonEvalIds=eval-b')
            : new Response(null, { status }),
        );
      });
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-c,eval-d');
    },
  );

  it.each([
    { initial: true, failure: 'http' },
    { initial: true, failure: 'network' },
    { initial: false, failure: 'http' },
    { initial: false, failure: 'network' },
  ])(
    'retries an initial=$initial comparison after a $failure failure',
    async ({ initial, failure }) => {
      const user = userEvent.setup();
      const defaultApi = getCallApiMock().getMockImplementation()!;
      let failComparison = true;
      getCallApiMock().mockImplementation((path, options) => {
        const url = new URL(path, window.location.origin);
        if (url.searchParams.has('comparisonEvalIds') && failComparison) {
          return failure === 'http'
            ? Promise.resolve(new Response(null, { status: 500 }))
            : Promise.reject(new Error('Network unavailable'));
        }
        return defaultApi(path, options);
      });
      renderPage(initial ? '/eval/eval-a?comparisonEvalIds=eval-b' : '/eval/eval-a');
      if (!initial) {
        await screen.findByTestId('comparison-columns');
        await user.click(screen.getByRole('button', { name: /Eval actions/ }));
        await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
        await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
      }
      await screen.findByText('Unable to load comparison. Please try again.');
      expect(screen.queryByText(/same dataset/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('comparison-columns')).not.toBeInTheDocument();
      failComparison = false;
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() =>
        expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b'),
      );
      expect(new URLSearchParams(window.location.search).getAll('comparisonEvalIds')).toEqual([
        'eval-b',
      ]);
    },
  );

  it('retries an unavailable latest-evaluation lookup without discarding its comparison URL', async () => {
    const user = userEvent.setup();
    const defaultApi = getCallApiMock().getMockImplementation()!;
    let failRecents = true;
    getCallApiMock().mockImplementation((path, options) =>
      path === '/results' && failRecents
        ? Promise.resolve(new Response(null, { status: 503 }))
        : defaultApi(path, options),
    );
    renderPage('/eval?comparisonEvalIds=eval-b');
    await screen.findByText('Unable to load comparison. Please try again.');
    failRecents = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-columns')).toHaveTextContent('eval-a,eval-b'),
    );
    expect(new URLSearchParams(window.location.search).getAll('comparisonEvalIds')).toEqual([
      'eval-b',
    ]);
  });

  it('recovers an oversized new comparison by clearing it and choosing fewer rows', async () => {
    tableFixture.realTable = true;
    tableFixture.rowCount = 120;
    const user = userEvent.setup();
    const defaultApi = getCallApiMock().getMockImplementation()!;
    getCallApiMock().mockImplementation((path, options) => {
      const url = new URL(path, window.location.origin);
      if (url.searchParams.has('comparisonEvalIds') && Number(url.searchParams.get('limit')) > 10) {
        return Promise.resolve(new Response(null, { status: 413 }));
      }
      return defaultApi(path, options);
    });
    renderPage('/eval/eval-a');
    await screen.findByText('eval-a row-0');
    await user.click(screen.getByRole('button', { name: /Eval actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
    await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
    await screen.findByText('Clear comparison, choose fewer results per page, and compare again.');
    expect(screen.queryByText(/same dataset/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear comparison' }));
    await screen.findByText('eval-a row-0');
    await user.click(screen.getByRole('combobox', { name: 'Results per page' }));
    await user.click(screen.getByRole('option', { name: '10' }));
    await waitFor(() => expect(screen.getAllByTestId('output')).toHaveLength(10));
    await user.click(screen.getByRole('button', { name: /Eval actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Compare with another eval' }));
    await user.click(screen.getByRole('button', { name: 'Select comparison B' }));
    await screen.findByText('eval-b row-0');
    expect(screen.getAllByTestId('output')).toHaveLength(20);
    expect(screen.getByRole('combobox', { name: 'Results per page' })).toHaveTextContent('10');
  });

  it('preserves the failed-page retry alert when a local rating updates the retained table', async () => {
    tableFixture.realTable = true;
    tableFixture.rowCount = 120;
    const user = userEvent.setup();
    const defaultApi = getCallApiMock().getMockImplementation()!;
    let failPage = true;
    getCallApiMock().mockImplementation((path, options) => {
      const url = new URL(path, window.location.origin);
      return url.pathname.endsWith('/table') && url.searchParams.get('offset') === '50' && failPage
        ? Promise.resolve(new Response(null, { status: 503 }))
        : defaultApi(path, options);
    });
    renderPage('/eval/eval-a');
    await screen.findByText('eval-a row-0');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByRole('button', { name: 'Retry' });
    act(() => {
      const table = useTableStore.getState().table!;
      useTableStore.getState().setTable({ ...table });
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(useTableStore.getState().tableErrorStatus).toBe(503);
    failPage = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('eval-a row-50');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it.each(['deleted', 'different-dataset'])(
    'allows recovery from a %s comparison',
    async (comparisonId) => {
      const user = userEvent.setup();
      renderPage(`/eval/eval-a?comparisonEvalIds=${comparisonId}`);
      expect(await screen.findByText(/Unable to load comparison/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear comparison' }));
      await waitFor(() =>
        expect(screen.getByTestId('comparison-columns')).toHaveTextContent(/^eval-a$/),
      );
      expect(window.location.search).toBe('');
    },
  );
});
