import { act } from 'react';

import { mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi, getApiBaseUrl } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Eval from './Eval';
import ResultsTable from './ResultsTable';
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
  useTableStore.setState(initialTableState, true);
  useResultsViewSettingsStore.setState(initialViewState, true);
  filterMode.current = 'all';
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
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
    expect(useTableStore.getState().table).toBe(otherTable);
    expect(useTableStore.getState().isFetching).toBe(false);
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
