import { act } from 'react';

import { mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi, getApiBaseUrl } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import Eval from './Eval';
import ResultsTable from './ResultsTable';
import { useResultsViewSettingsStore, useTableStore } from './store';

const { filterMode, showToast, apiConfig, runtime } = vi.hoisted(() => ({
  filterMode: { current: 'all' as 'all' | 'failures' },
  showToast: vi.fn(),
  apiConfig: { apiBaseUrl: '' },
  runtime: { isRunningLocally: true },
}));

vi.mock('@app/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/constants')>()),
  get IS_RUNNING_LOCALLY() {
    return runtime.isRunningLocally;
  },
}));
vi.mock('@app/utils/api', () => ({ callApi: vi.fn(), getApiBaseUrl: vi.fn(() => '') }));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@app/stores/apiConfig', () => ({ default: () => apiConfig }));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(), disconnect: vi.fn() }),
}));
vi.mock('./FilterModeProvider', () => ({
  useFilterMode: () => ({ filterMode: filterMode.current, setFilterMode: vi.fn() }),
}));
vi.mock('./EvalOutputCell', () => ({
  default: ({
    output,
    onRating,
  }: {
    output: { score: number };
    onRating: (pass: boolean | undefined, score: number) => void;
  }) => (
    <div>
      <span>Persisted score: {output.score}</span>
      <button onClick={() => onRating(false, 0)}>Fail result</button>
      <button onClick={() => onRating(undefined, 0.25)}>Set score</button>
    </div>
  ),
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
  resetCallApiMock();
  vi.mocked(getApiBaseUrl).mockReset().mockReturnValue('');
  useTableStore.setState({ ...initialTableState, ratingQueues: new Map() }, true);
  useResultsViewSettingsStore.setState(initialViewState, true);
  filterMode.current = 'all';
  apiConfig.apiBaseUrl = '';
  runtime.isRunningLocally = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

it('loads pinned eval filters without repeating the initial selection request', async () => {
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
  expect(pending).toHaveLength(1);
  await resolveTableRequests();

  expect(screen.queryByText('404 Eval not found')).not.toBeInTheDocument();
  expect(useTableStore.getState().tableQuery?.url).toContain('filterMode=failures');
  expect(useTableStore.getState().isFetching).toBe(false);
  expect(rendered.container.querySelector('table.results-table')).not.toBeNull();
});

it.each(['before', 'after'] as const)(
  'keeps the hosted page size when recent evals complete %s the filtered table',
  async (recentOrder) => {
    runtime.isRunningLocally = false;
    const user = userEvent.setup();
    const requests: string[] = [];
    let releaseRecent!: () => void;
    let releaseTable!: () => void;
    const recentReady = new Promise<void>((resolve) => {
      releaseRecent = resolve;
    });
    const tableReady = new Promise<void>((resolve) => {
      releaseTable = resolve;
    });
    onTestFinished(() => {
      releaseRecent();
      releaseTable();
    });
    mockCallApiRoutes([
      {
        path: /^\/(?:results$|eval\/hosted\/table\?)/,
        repeat: true,
        response: async (url: string) => {
          requests.push(url);
          if (url === '/results') {
            if (filterMode.current !== 'all') {
              await recentReady;
            }
            return { data: [{ evalId: 'hosted' }] };
          }
          const query = new URL(url, window.location.origin).searchParams;
          const filtered = query.get('filterMode') === 'failures';
          const count = filtered ? 80 : 100;
          const offset = Number(query.get('offset'));
          const limit = Number(query.get('limit'));
          if (filtered) {
            await tableReady;
          }
          return {
            table: {
              head: { prompts: [], vars: ['case'] },
              body: Array.from({ length: Math.min(limit, count - offset) }, (_, index) => ({
                outputs: [],
                test: {},
                testIdx: offset + index,
                vars: [`${filtered ? 'filtered' : 'all'} row ${offset + index}`],
              })),
            },
            config: {},
            version: 4,
            totalCount: 100,
            filteredCount: count,
          };
        },
      },
    ]);
    const element = () => (
      <MemoryRouter>
        <Eval fetchId={null} />
      </MemoryRouter>
    );
    const rendered = renderWithProviders(element());
    await screen.findByText('all row 49');
    await user.click(screen.getByLabelText('Results per page'));
    await user.click(screen.getByRole('option', { name: '10' }));
    await waitFor(() => expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(10));

    filterMode.current = 'failures';
    rendered.rerender(element());
    await waitFor(() =>
      expect(requests.some((url) => url.includes('filterMode=failures'))).toBe(true),
    );
    await act(async () => {
      (recentOrder === 'before' ? releaseRecent : releaseTable)();
    });
    await act(async () => {
      (recentOrder === 'before' ? releaseTable : releaseRecent)();
    });
    await screen.findByText('filtered row 0');
    await waitFor(() => expect(useTableStore.getState().isFetching).toBe(false));

    expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(screen.getByLabelText('Results per page')).toHaveTextContent('10');
    expect(
      new URL(useTableStore.getState().tableQuery!.url, window.location.origin).searchParams.get(
        'limit',
      ),
    ).toBe('10');
    expect(requests.filter((url) => url === '/results')).toHaveLength(1);

    requests.length = 0;
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('filtered row 10');
    expect(requests).toHaveLength(1);
    const query = new URL(requests[0], window.location.origin).searchParams;
    expect(query.get('offset')).toBe('10');
    expect(query.get('limit')).toBe('10');
    expect(query.get('filterMode')).toBe('failures');
    expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(10);
  },
);

it('uses the latest filter mode when the initial hosted recent-eval request completes', async () => {
  runtime.isRunningLocally = false;
  let releaseRecent!: () => void;
  const recentReady = new Promise<void>((resolve) => {
    releaseRecent = resolve;
  });
  onTestFinished(() => releaseRecent());
  const requests: string[] = [];
  mockCallApiRoutes([
    {
      path: /^\/(?:results$|eval\/hosted\/table\?)/,
      repeat: true,
      response: async (url: string) => {
        requests.push(url);
        if (url === '/results') {
          await recentReady;
          return { data: [{ evalId: 'hosted' }] };
        }
        return {
          table: { head: { prompts: [], vars: [] }, body: [] },
          config: {},
          version: 4,
          totalCount: 100,
          filteredCount: 80,
        };
      },
    },
  ]);
  const element = () => (
    <MemoryRouter>
      <Eval fetchId={null} />
    </MemoryRouter>
  );
  const rendered = renderWithProviders(element());
  await waitFor(() => expect(requests).toEqual(['/results']));
  filterMode.current = 'failures';
  rendered.rerender(element());
  await act(async () => {
    releaseRecent();
  });
  await waitFor(() => expect(useTableStore.getState().table).not.toBeNull());

  expect(requests.filter((url) => url === '/results')).toHaveLength(1);
  const tableRequests = requests.filter((url) => url.startsWith('/eval/'));
  expect(tableRequests).toHaveLength(1);
  expect(new URL(tableRequests[0], window.location.origin).searchParams.get('filterMode')).toBe(
    'failures',
  );
  expect(screen.queryByText('404 Eval not found')).not.toBeInTheDocument();
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

it.each(['success', 'HTTP failure', 'network failure'] as const)(
  'owns the initial load when navigating to a paged eval: %s',
  async (outcome) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const pending: Array<() => void> = [];
    const destinationRequests: string[] = [];
    let holdDestination = true;
    const response = async (url: string) => {
      if (url === '/results') {
        return { data: [{ evalId: 'source' }, { evalId: 'destination' }] };
      }
      const parsed = new URL(url, window.location.origin);
      const id = parsed.pathname.split('/')[2];
      const offset = Number(parsed.searchParams.get('offset'));
      const payload = {
        table: {
          head: { prompts: [], vars: ['case'] },
          body: Array.from({ length: Math.min(50, 80 - offset) }, (_, index) => ({
            outputs: [],
            test: {},
            testIdx: offset + index,
            vars: [`${id} row ${offset + index}`],
          })),
        },
        config: {},
        version: 4,
        totalCount: 80,
        filteredCount: 80,
      };
      if (id === 'destination') {
        destinationRequests.push(url);
        if (holdDestination) {
          return new Promise((resolve, reject) =>
            pending.push(() => {
              if (outcome === 'network failure') {
                reject(new Error('Connection lost'));
              } else {
                resolve(payload);
              }
            }),
          );
        }
      }
      return payload;
    };
    mockCallApiRoutes([
      {
        path: /^\/(?:results$|eval\/(source|destination)\/table\?)/,
        repeat: true,
        response,
      },
    ]);
    const element = (id: string) => (
      <MemoryRouter>
        <Eval fetchId={id} />
      </MemoryRouter>
    );
    const rendered = renderWithProviders(element('source'));
    await screen.findByText('source row 0');
    if (outcome === 'HTTP failure') {
      mockCallApiRoutes([
        { path: /^\/eval\/destination\/table\?/, repeat: true, status: 404, response },
      ]);
    }
    window.history.replaceState({}, '', '/eval/destination?rowId=75');
    rendered.rerender(element('destination'));
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    expect(screen.queryByText('source row 0')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for eval data')).toBeInTheDocument();
    await act(async () => {
      holdDestination = false;
      pending.forEach((complete) => complete());
    });
    if (outcome === 'success') {
      await screen.findByText('destination row 75');
      expect(screen.getByLabelText('Go to page')).toHaveValue(2);
      expect(
        destinationRequests.map((url) =>
          new URL(url, window.location.origin).searchParams.get('offset'),
        ),
      ).toEqual(['0', '50']);
      expect(screen.queryByText('404 Eval not found')).not.toBeInTheDocument();
    } else {
      await screen.findByText('404 Eval not found');
      expect(useTableStore.getState().table).toBeNull();
      expect(useTableStore.getState().isFetching).toBe(false);
    }
  },
);

const ratingTable: NonNullable<ReturnType<typeof useTableStore.getState>['table']> = {
  head: { prompts: [{ raw: 'test', label: 'test', provider: 'test' }], vars: [] },
  body: [
    {
      test: {},
      testIdx: 0,
      vars: [],
      outputs: [
        {
          id: 'result-id',
          cost: 0,
          failureReason: 0,
          latencyMs: 0,
          namedScores: {},
          pass: true,
          prompt: 'test',
          score: 1,
          testCase: {},
          text: 'test output',
          gradingResult: { pass: true, score: 1, reason: 'Automated pass' },
        },
      ],
    },
  ],
};
const ratingTableProps = {
  columnVisibility: {},
  failureFilter: {},
  filterMode: 'all' as const,
  maxTextLength: 100,
  onFailureFilterToggle: vi.fn(),
  showStats: false,
  wordBreak: 'break-word' as const,
  zoom: 1,
};
const ratingQuery = '/eval/rating-eval/table?offset=0&limit=50&filterMode=all&search=test';
const ratingRoute = '/eval/rating-eval/results/result-id/rating';

function initializeRatingTable() {
  useTableStore.setState({
    evalId: 'rating-eval',
    table: structuredClone(ratingTable),
    config: {},
    version: 4,
    filteredResultsCount: 1,
    totalResultsCount: 1,
    tableQuery: { evalId: 'rating-eval', url: ratingQuery },
  });
}

function ratingView(showResults: boolean) {
  return (
    <MemoryRouter>
      {showResults ? <ResultsTable {...ratingTableProps} /> : <div>Report</div>}
    </MemoryRouter>
  );
}

it.each([
  { outcome: 'success', remountBeforeCompletion: false },
  { outcome: 'success', remountBeforeCompletion: true },
  { outcome: 'confirmed failure', remountBeforeCompletion: false },
  { outcome: 'ambiguous failure', remountBeforeCompletion: false },
])(
  'refreshes shared results after off-screen $outcome (early remount: $remountBeforeCompletion)',
  async ({ outcome, remountBeforeCompletion }) => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    initializeRatingTable();
    let serverTable = structuredClone(ratingTable);
    let resolveFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let writeCount = 0;
    const reads: string[] = [];
    const writeResponse = async () => {
      writeCount += 1;
      if (writeCount === 1) {
        await firstWrite;
      } else if (outcome === 'confirmed failure') {
        return {};
      }
      const score = writeCount === 1 ? 0 : 0.25;
      serverTable = structuredClone(serverTable);
      Object.assign(serverTable.body[0].outputs[0], {
        pass: false,
        score,
        failureReason: 1,
        gradingResult: { pass: false, score },
      });
      if (writeCount === 2 && outcome === 'ambiguous failure') {
        throw new Error('Connection lost after commit');
      }
      return {
        id: 'result-id',
        success: false,
        score,
        failureReason: 1,
        gradingResult: { pass: false, score },
      };
    };
    mockCallApiRoutes([
      { path: ratingRoute, method: 'POST', response: writeResponse },
      {
        path: ratingRoute,
        method: 'POST',
        status: outcome === 'confirmed failure' ? 400 : 200,
        response: writeResponse,
      },
      {
        path: ratingQuery,
        response: (url: string) => {
          reads.push(url);
          return { table: serverTable, config: {}, version: 4, totalCount: 1, filteredCount: 1 };
        },
      },
    ]);

    const rendered = renderWithProviders(ratingView(true));
    await user.click(screen.getByRole('button', { name: 'Fail result' }));
    await user.click(screen.getByRole('button', { name: 'Set score' }));
    expect(writeCount).toBe(1);
    rendered.rerender(ratingView(false));
    expect(useTableStore.getState().ratingQueues.size).toBe(1);
    if (remountBeforeCompletion) {
      rendered.rerender(ratingView(true));
    }
    await act(async () => resolveFirst());
    const expectedScore = outcome === 'confirmed failure' ? 0 : 0.25;
    await waitFor(() => expect(reads).toEqual([ratingQuery]));
    await waitFor(() =>
      expect(useTableStore.getState().table?.body[0].outputs[0].score).toBe(expectedScore),
    );
    expect(writeCount).toBe(2);
    expect(useTableStore.getState().ratingQueues.size).toBe(0);
    expect(useTableStore.getState().tableQuery?.url).toBe(ratingQuery);
    if (!remountBeforeCompletion) {
      rendered.rerender(ratingView(true));
    }
    expect(screen.getByText(`Persisted score: ${expectedScore}`)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledTimes(outcome === 'success' ? 0 : 1);
  },
);

it.each(['eval', 'API'] as const)(
  'does not refresh a different %s when off-screen rating writes complete',
  async (changedScope) => {
    const user = userEvent.setup();
    initializeRatingTable();
    let resolveWrite!: (body: unknown) => void;
    mockCallApiRoutes([
      {
        path: ratingRoute,
        method: 'POST',
        response: () =>
          new Promise((resolve) => {
            resolveWrite = resolve;
          }),
      },
    ]);
    const rendered = renderWithProviders(ratingView(true));
    await user.click(screen.getByRole('button', { name: 'Fail result' }));
    rendered.rerender(ratingView(false));
    const otherTable = structuredClone(ratingTable);
    otherTable.body[0].outputs[0].text = 'Other scope';
    act(() => {
      useTableStore.setState({
        evalId: changedScope === 'eval' ? 'other-eval' : 'rating-eval',
        table: otherTable,
      });
      if (changedScope === 'API') {
        vi.mocked(getApiBaseUrl).mockReturnValue('https://other.example.test');
      }
    });
    expect(useTableStore.getState().ratingQueues.size).toBe(1);
    await act(async () =>
      resolveWrite({
        id: 'result-id',
        success: false,
        score: 0,
        failureReason: 1,
        gradingResult: { pass: false, score: 0 },
      }),
    );
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(useTableStore.getState().ratingQueues.size).toBe(0);
    expect(useTableStore.getState().table).toBe(otherTable);
    expect(useTableStore.getState().isFetching).toBe(false);
  },
);

it.each(['eval', 'API'] as const)(
  'releases settled queues after changing %s even when the old refresh remains pending',
  async (changedScope) => {
    const user = userEvent.setup();
    initializeRatingTable();
    let releaseRead!: () => void;
    const heldRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    onTestFinished(async () => {
      await act(async () => releaseRead());
    });
    mockCallApiRoutes([
      {
        path: ratingRoute,
        method: 'POST',
        response: {
          id: 'result-id',
          success: false,
          score: 0,
          failureReason: 1,
          gradingResult: { pass: false, score: 0 },
        },
      },
      { path: ratingQuery, response: () => heldRead, status: 500 },
    ]);
    const rootView = () => (
      <MemoryRouter>
        <Eval fetchId={null} />
      </MemoryRouter>
    );
    const rendered = renderWithProviders(rootView());
    await user.click(screen.getByRole('button', { name: 'Fail result' }));
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(2));
    const queue = [...useTableStore.getState().ratingQueues.values()][0];
    expect(queue.tail?.settled).toBe(true);
    expect(queue.edits.get(JSON.stringify(['result', 'result-id']))?.completed.pass).toBe(false);
    expect(useTableStore.getState().ratingQueues.size).toBe(1);

    if (changedScope === 'eval') {
      rendered.rerender(ratingView(false));
      act(() => useTableStore.getState().setEvalId('other-eval'));
    } else {
      apiConfig.apiBaseUrl = 'https://offline.example.test';
      vi.mocked(getApiBaseUrl).mockReturnValue(apiConfig.apiBaseUrl);
      rendered.rerender(rootView());
    }
    expect(useTableStore.getState().ratingQueues.size).toBe(0);
    await act(async () => releaseRead());
    expect(useTableStore.getState().ratingQueues.size).toBe(0);
  },
);

it.each([200, 500])(
  'retains a settled queue until a background selection commits (HTTP %i)',
  async (status) => {
    const user = userEvent.setup();
    initializeRatingTable();
    let finishSelection!: () => void;
    const selection = new Promise<void>((resolve) => {
      finishSelection = resolve;
    });
    onTestFinished(async () => {
      await act(async () => finishSelection());
    });
    mockCallApiRoutes([
      {
        path: ratingRoute,
        method: 'POST',
        response: {
          id: 'result-id',
          success: false,
          score: 0,
          failureReason: 1,
          gradingResult: { pass: false, score: 0 },
        },
      },
      { path: ratingQuery, status: 500, response: {} },
      {
        path: '/eval/other-eval/table?offset=0&limit=50&filterMode=all',
        status,
        response: async () => {
          await selection;
          return { table: ratingTable, config: {}, version: 4, totalCount: 1, filteredCount: 1 };
        },
      },
    ]);
    const rendered = renderWithProviders(ratingView(true));
    await user.click(screen.getByRole('button', { name: 'Fail result' }));
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(2));
    rendered.rerender(ratingView(false));
    let switching!: ReturnType<ReturnType<typeof useTableStore.getState>['fetchEvalData']>;
    act(() => {
      switching = useTableStore.getState().fetchEvalData('other-eval', { skipLoadingState: true });
    });
    expect(useTableStore.getState().evalId).toBe('rating-eval');
    expect(useTableStore.getState().ratingQueues.size).toBe(1);
    await act(async () => {
      finishSelection();
      await switching;
    });
    expect(useTableStore.getState().evalId).toBe(status === 200 ? 'other-eval' : 'rating-eval');
    expect(useTableStore.getState().ratingQueues.size).toBe(status === 200 ? 0 : 1);
    if (status === 500) {
      act(() => useTableStore.getState().setEvalId('other-eval'));
      expect(useTableStore.getState().ratingQueues.size).toBe(0);
    }
  },
);

it('retains pending writes across navigation away and back until their authoritative refresh', async () => {
  const user = userEvent.setup();
  initializeRatingTable();
  let releaseWrite!: () => void;
  const heldWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  onTestFinished(async () => {
    await act(async () => releaseWrite());
  });
  let writeCount = 0;
  const serverTable = structuredClone(ratingTable);
  const payload = () => ({
    table: structuredClone(serverTable),
    config: {},
    version: 4,
    totalCount: 1,
    filteredCount: 1,
  });
  const writeResponse = async (_url: string, options?: RequestInit) => {
    writeCount += 1;
    if (writeCount === 1) {
      await heldWrite;
    }
    const gradingResult = JSON.parse(options?.body as string);
    Object.assign(serverTable.body[0].outputs[0], {
      pass: gradingResult.pass,
      score: gradingResult.score,
      gradingResult,
    });
    return {
      id: 'result-id',
      success: gradingResult.pass,
      score: gradingResult.score,
      failureReason: 1,
      gradingResult,
    };
  };
  mockCallApiRoutes([
    { path: ratingRoute, method: 'POST', response: writeResponse },
    { path: /^\/eval\/rating-eval\/table\?/, response: payload },
    { path: ratingRoute, method: 'POST', response: writeResponse },
    { path: /^\/eval\/rating-eval\/table\?/, response: payload },
  ]);
  const rendered = renderWithProviders(ratingView(true));
  await user.click(screen.getByRole('button', { name: 'Fail result' }));
  const queue = [...useTableStore.getState().ratingQueues.values()][0];
  rendered.rerender(ratingView(false));
  act(() => useTableStore.getState().setEvalId('other-eval'));
  expect([...useTableStore.getState().ratingQueues.values()]).toEqual([queue]);
  expect(queue.tail?.settled).toBe(false);
  await act(async () => {
    useTableStore.getState().setEvalId('rating-eval');
    await useTableStore.getState().fetchEvalData('rating-eval');
  });
  expect(useTableStore.getState().table?.body[0].outputs[0].score).toBe(0);
  rendered.rerender(ratingView(true));
  await user.click(screen.getByRole('button', { name: 'Set score' }));
  expect(writeCount).toBe(1);
  expect([...useTableStore.getState().ratingQueues.values()]).toEqual([queue]);
  await act(async () => releaseWrite());
  await waitFor(() => expect(useTableStore.getState().ratingQueues.size).toBe(0));
  expect(writeCount).toBe(2);
  expect(serverTable.body[0].outputs[0].score).toBe(0.25);
  expect(useTableStore.getState().table?.body[0].outputs[0].score).toBe(0.25);
});

it.each([200, 500])(
  'preserves pending edits and a foreground selection across a background read (HTTP %i)',
  async (status) => {
    const user = userEvent.setup();
    initializeRatingTable();
    const pending: Array<(body: unknown) => void> = [];
    const response = () => new Promise((resolve) => pending.push(resolve));
    const tableData = {
      table: structuredClone(ratingTable),
      config: {},
      version: 4,
      totalCount: 1,
      filteredCount: 1,
    };
    const writeData = {
      id: 'result-id',
      success: false,
      score: 0,
      failureReason: 1,
      gradingResult: { pass: false, score: 0 },
    };
    onTestFinished(async () => {
      await act(async () => {
        pending[0]?.(writeData);
        pending[1]?.(tableData);
        pending[2]?.(tableData);
      });
    });
    mockCallApiRoutes([
      { path: '/eval/rating-eval/results/result-id/rating', method: 'POST', response },
      { path: '/eval/next-eval/table?offset=0&limit=50&filterMode=all', response },
      { path: '/eval/rating-eval/table?offset=0&limit=50&filterMode=all', status, response },
    ]);
    renderWithProviders(ratingView(true));
    await user.click(screen.getByRole('button', { name: 'Fail result' }));
    let switching!: ReturnType<ReturnType<typeof useTableStore.getState>['fetchEvalData']>;
    let refreshing!: typeof switching;
    await act(async () => {
      switching = useTableStore.getState().fetchEvalData('next-eval');
      refreshing = useTableStore.getState().fetchEvalData('rating-eval', {
        skipLoadingState: true,
        skipSettingEvalId: true,
      });
    });
    const selection = useTableStore.getState().tableSelectionRequest;
    await act(async () => {
      pending[2](tableData);
      await refreshing;
    });
    expect(useTableStore.getState().table?.body[0].outputs[0].score).toBe(0);
    expect(useTableStore.getState().tableSelectionRequest).toBe(selection);
    expect(useTableStore.getState().isFetching).toBe(true);

    const nextTable = structuredClone(ratingTable);
    nextTable.body[0].outputs[0].text = 'Next eval';
    await act(async () => {
      pending[1]({ ...tableData, table: nextTable });
      await switching;
      pending[0](writeData);
    });
    expect(useTableStore.getState().evalId).toBe('next-eval');
    expect(useTableStore.getState().table).toBe(nextTable);
    expect(useTableStore.getState().isFetching).toBe(false);
    expect(useTableStore.getState().tableSelectionRequest).toBeNull();
    expect(callApi).toHaveBeenCalledTimes(3);
  },
);

it.each([
  { first: 'refresh', refreshFails: false, switchFails: false },
  { first: 'switch', refreshFails: false, switchFails: false },
  { first: 'refresh', refreshFails: true, switchFails: false },
  { first: 'refresh', refreshFails: false, switchFails: true },
])(
  'preserves pending eval selection ($first first, refresh failure $refreshFails, switch failure $switchFails)',
  async ({ first, refreshFails, switchFails }) => {
    initializeRatingTable();
    const pending = new Map<string, (body: unknown) => void>();
    const response = (url: string) => new Promise((resolve) => pending.set(url, resolve));
    mockCallApiRoutes([
      { path: /^\/eval\/next-eval\/table\?/, status: switchFails ? 500 : 200, response },
      { path: ratingQuery, status: refreshFails ? 500 : 200, response },
    ]);
    const switching = useTableStore
      .getState()
      .fetchEvalData('next-eval', { skipLoadingState: true });
    const refreshing = useTableStore.getState().fetchEvalData('rating-eval', {
      skipLoadingState: true,
      skipSettingEvalId: true,
    });
    expect(useTableStore.getState().evalId).toBe('rating-eval');
    expect(useTableStore.getState().tableQuery?.url).toBe(ratingQuery);
    expect([...pending.keys()][1]).toBe(ratingQuery);
    const nextTable = structuredClone(ratingTable);
    nextTable.body[0].outputs[0].text = 'Next eval';
    const complete = async (which: string) => {
      const isSwitch = which === 'switch';
      const url = isSwitch ? [...pending.keys()][0] : ratingQuery;
      pending.get(url)!({
        table: isSwitch ? nextTable : ratingTable,
        config: {},
        version: 4,
        totalCount: 1,
        filteredCount: 1,
      });
      await (isSwitch ? switching : refreshing);
    };
    await complete(first);
    await complete(first === 'switch' ? 'refresh' : 'switch');
    expect(useTableStore.getState().evalId).toBe(switchFails ? 'rating-eval' : 'next-eval');
    expect(useTableStore.getState().table).toEqual(switchFails ? ratingTable : nextTable);
    expect(useTableStore.getState().isFetching).toBe(false);
    if (switchFails) {
      expect(useTableStore.getState().tableQuery?.url).toBe(ratingQuery);
    }
  },
);

it.each([
  { foreground: false, newestFails: false },
  { foreground: false, newestFails: true },
  { foreground: true, newestFails: false },
])(
  'only the newest selection can replace the eval ($foreground foreground, failure $newestFails)',
  async ({ foreground, newestFails }) => {
    initializeRatingTable();
    const pending: Array<(body: unknown) => void> = [];
    const response = () => new Promise((resolve) => pending.push(resolve));
    mockCallApiRoutes([
      { path: /^\/eval\/older-eval\/table\?/, response },
      { path: /^\/eval\/newest-eval\/table\?/, status: newestFails ? 500 : 200, response },
    ]);
    const older = useTableStore.getState().fetchEvalData('older-eval', { skipLoadingState: true });
    const newer = useTableStore
      .getState()
      .fetchEvalData('newest-eval', { skipLoadingState: !foreground });
    const payload = { table: ratingTable, config: {}, version: 4, totalCount: 1, filteredCount: 1 };
    pending[1](payload);
    await newer;
    pending[0](payload);
    expect(await older).toBeUndefined();
    expect(useTableStore.getState().evalId).toBe(newestFails ? 'rating-eval' : 'newest-eval');
    expect(useTableStore.getState().isFetching).toBe(false);
  },
);

it.each([
  { changed: 'page', rejected: false },
  { changed: 'page', rejected: true },
  { changed: 'result', rejected: false },
  { changed: 'result', rejected: true },
  { changed: 'eval', rejected: false },
  { changed: 'eval', rejected: true },
])(
  'preserves a newer store $changed before React renders (rejected $rejected)',
  async ({ changed, rejected }) => {
    initializeRatingTable();
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveWrite!: (body: unknown) => void;
    mockCallApiRoutes([
      {
        path: ratingRoute,
        method: 'POST',
        status: rejected ? 400 : 200,
        response: () =>
          new Promise((resolve) => {
            resolveWrite = resolve;
          }),
      },
      { path: ratingQuery, status: 500 },
    ]);
    renderWithProviders(ratingView(true));
    await user.click(screen.getByRole('button', { name: 'Fail result' }));
    const newTable = structuredClone(ratingTable);
    if (changed !== 'result') {
      newTable.body[0].outputs[0].id = 'different-result';
    }
    newTable.body[0].outputs[0].score = 0.75;
    resolveWrite({
      id: 'result-id',
      success: false,
      score: 0,
      failureReason: 1,
      gradingResult: { pass: false, score: 0 },
    });
    const publishNewTable = () =>
      useTableStore.setState({
        table: newTable,
        ...(changed === 'eval' && { evalId: 'other-eval' }),
      });
    // Advance Zustand after response delivery (and JSON parsing on success), but before
    // rating reconciliation and React's render. The helper awaits the deferred body first.
    queueMicrotask(() =>
      queueMicrotask(() => (rejected ? publishNewTable() : queueMicrotask(publishNewTable))),
    );
    await waitFor(() => expect(useTableStore.getState().table).toBe(newTable));
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(changed === 'eval' ? 1 : 2));
    expect(useTableStore.getState().table).toBe(newTable);
    expect(screen.getByText('Persisted score: 0.75')).toBeInTheDocument();
  },
);

it.each([false, true])(
  'keeps the pending destination load as a fallback when its refresh fails (%s)',
  async (refreshFails) => {
    initializeRatingTable();
    const pending: Array<(body: unknown) => void> = [];
    const response = () => new Promise((resolve) => pending.push(resolve));
    mockCallApiRoutes([
      { path: /^\/eval\/next-eval\/table\?/, response },
      { path: /^\/eval\/next-eval\/table\?/, status: refreshFails ? 500 : 200, response },
    ]);
    const selection = useTableStore
      .getState()
      .fetchEvalData('next-eval', { skipLoadingState: true });
    const refresh = useTableStore.getState().fetchEvalData('next-eval', { skipLoadingState: true });
    const olderTable = structuredClone(ratingTable);
    olderTable.body[0].outputs[0].score = 0.25;
    const newerTable = structuredClone(ratingTable);
    newerTable.body[0].outputs[0].score = 0.75;
    const payload = (table: typeof ratingTable) => ({
      table,
      config: {},
      version: 4,
      totalCount: 1,
      filteredCount: 1,
    });
    pending[1](payload(newerTable));
    await refresh;
    pending[0](payload(olderTable));
    await selection;
    expect(useTableStore.getState().evalId).toBe('next-eval');
    expect(useTableStore.getState().table).toEqual(refreshFails ? olderTable : newerTable);
    expect(useTableStore.getState().isFetching).toBe(false);
  },
);
