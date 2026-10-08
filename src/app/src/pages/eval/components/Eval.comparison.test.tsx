import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvalPage from '../page';
import { useResultsViewSettingsStore, useTableStore } from './store';

const { socketHandlers } = vi.hoisted(() => ({
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
vi.mock('./ResultsTable', () => ({
  default: () => {
    const { table } = useTableStore();
    return (
      <div data-testid="comparison-columns">
        {table?.head.prompts.map((p) => p.label).join(',')}
      </div>
    );
  },
}));
vi.mock('./ResultsCharts', () => ({ default: () => null }));
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

function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/eval/eval-c?comparisonEvalIds=eval-d&search=second')}>
        Other comparison
      </button>
      <button onClick={() => navigate('/eval/eval-c')}>Other eval</button>
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
  vi.mocked(callApi).mockReset();
  socketHandlers.clear();
  useTableStore.setState(initialTableState);
  useResultsViewSettingsStore.setState(initialSettings);
  vi.mocked(callApi).mockImplementation(async (path) => {
    const url = new URL(String(path), window.location.origin);
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
    return new Response(
      JSON.stringify({
        table: {
          head: {
            vars: [],
            prompts: [id, ...comparisons].map((label) => ({ label, raw: label, provider: 'echo' })),
          },
          body: [],
        },
        config: { description: 'Comparison fixture' },
        totalCount: 0,
        filteredCount: 0,
      }),
    );
  });
});

afterEach(() => {
  cleanup();
  useTableStore.setState(initialTableState);
  useResultsViewSettingsStore.setState(initialSettings);
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

  it.each([200, 404])(
    'keeps the current comparison when an earlier navigation resolves late with %s',
    async (status) => {
      const user = userEvent.setup();
      const defaultApi = vi.mocked(callApi).getMockImplementation()!;
      let finishOldRequest!: (response: Response) => void;
      vi.mocked(callApi).mockImplementation((path, options) => {
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
