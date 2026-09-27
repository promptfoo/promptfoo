import { act } from 'react';

import { createMockResponse, mockCallApiRoutes } from '@app/tests/apiMocks';
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
  vi.mocked(callApi).mockReset();
  vi.mocked(getApiBaseUrl).mockReset().mockReturnValue('');
  useTableStore.setState(initialTableState, true);
  useResultsViewSettingsStore.setState(initialViewState, true);
  filterMode.current = 'all';
});

afterEach(() => {
  vi.restoreAllMocks();
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
    vi.mocked(callApi).mockImplementation(async (url, options) => {
      if (options?.method === 'POST') {
        writeCount += 1;
        if (writeCount === 1) {
          await firstWrite;
        } else if (outcome === 'confirmed failure') {
          return createMockResponse({}, { status: 400 });
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
        return createMockResponse({
          id: 'result-id',
          success: false,
          score,
          failureReason: 1,
          gradingResult: { pass: false, score },
        });
      }
      reads.push(url);
      return createMockResponse({
        table: serverTable,
        config: {},
        version: 4,
        totalCount: 1,
        filteredCount: 1,
      });
    });

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
    let resolveWrite!: (response: Response) => void;
    vi.mocked(callApi).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveWrite = resolve;
      }),
    );
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
      resolveWrite(
        createMockResponse({
          id: 'result-id',
          success: false,
          score: 0,
          failureReason: 1,
          gradingResult: { pass: false, score: 0 },
        }),
      ),
    );
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(useTableStore.getState().table).toBe(otherTable);
    expect(useTableStore.getState().isFetching).toBe(false);
  },
);
