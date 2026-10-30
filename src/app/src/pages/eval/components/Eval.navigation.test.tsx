import { createRef } from 'react';

import FrameworkPluginResult from '@app/pages/redteam/report/components/FrameworkPluginResult';
import TestSuites from '@app/pages/redteam/report/components/TestSuites';
import { mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Eval from './Eval';
import FilterModeProvider from './FilterModeProvider';
import { useResultsViewSettingsStore, useTableStore } from './store';

const { report, showToast } = vi.hoisted(() => ({
  report: { source: 'plugin' as 'plugin' | 'policy' | 'framework' },
  showToast: vi.fn(),
}));

vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(async () => null),
}));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@app/hooks/useCloudConfig', () => ({ default: () => ({ data: null }) }));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(), disconnect: vi.fn() }),
}));
vi.mock('@app/pages/redteam/report/components/Report', () => ({
  default: () =>
    report.source === 'framework' ? (
      <FrameworkPluginResult
        evalId="navigation"
        plugin="harmful:hate"
        getPluginASR={() => ({ asr: 50, total: 2, failCount: 1 })}
        type="failed"
      />
    ) : (
      <TestSuites
        evalId="navigation"
        categoryStats={{
          [report.source === 'policy' ? '012345abcdef' : 'harmful:hate']: {
            pass: 1,
            total: 2,
            passWithFilter: 1,
            failCount: 1,
          },
        }}
        plugins={
          report.source === 'policy'
            ? [
                {
                  id: 'policy',
                  config: {
                    policy: {
                      id: '012345abcdef',
                      name: 'Example policy',
                      text: 'Protect private data',
                    },
                  },
                },
              ]
            : [{ id: 'harmful:hate' }]
        }
        vulnerabilitiesDataGridRef={createRef<HTMLDivElement>()}
      />
    ),
}));

const initialTableState = useTableStore.getState();
const initialViewState = useResultsViewSettingsStore.getState();
const pluginFilter = [{ type: 'plugin', operator: 'equals', value: 'harmful:hate' }];
const requests: string[] = [];

beforeEach(() => {
  resetCallApiMock();
  useTableStore.setState({ ...initialTableState, ratingQueues: new Map() }, true);
  useResultsViewSettingsStore.setState(initialViewState, true);
  report.source = 'plugin';
  requests.length = 0;
  mockCallApiRoutes([
    {
      path: /^\/(?:results$|eval\/navigation\/table\?)/,
      repeat: true,
      response: (path: string) => {
        if (path === '/results') {
          return { data: [{ evalId: 'navigation' }] };
        }
        requests.push(path);
        const query = new URL(path, window.location.origin).searchParams;
        const mode = query.get('filterMode');
        const filters = query.getAll('filter').map((value) => JSON.parse(value));
        const indices = [0, 1, 2, 3].filter((index) => {
          const passesMode =
            mode === 'all' || (mode === 'passes' ? index % 2 === 1 : index % 2 === 0);
          return (
            passesMode &&
            filters.every((filter) => {
              const matches = filter.type === 'policy' ? index >= 2 : index < 2;
              return filter.operator === 'not_equals' ? !matches : matches;
            })
          );
        });
        return {
          table: {
            head: { prompts: [], vars: ['case'] },
            body: indices.map((index) => ({
              outputs: [],
              test: {},
              testIdx: index,
              vars: [`row ${index}`],
            })),
          },
          config: { redteam: { plugins: [], strategies: [] } },
          version: 4,
          totalCount: 4,
          filteredCount: indices.length,
        };
      },
    },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

function UrlControls() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/eval/navigation')}>Clear URL filters</button>
      <button
        onClick={() =>
          navigate(`/eval/navigation?filter=${encodeURIComponent(JSON.stringify(pluginFilter))}`)
        }
      >
        Apply URL filter
      </button>
    </>
  );
}

function renderEval(search = '') {
  window.history.replaceState({}, '', `/eval/navigation${search}`);
  return renderWithProviders(
    <BrowserRouter>
      <UrlControls />
      <FilterModeProvider>
        <Eval fetchId="navigation" />
      </FilterModeProvider>
    </BrowserRouter>,
  );
}

it.each(['plugin', 'policy', 'framework'] as const)(
  'loads the same-eval %s report drill-down without a reload',
  async (source) => {
    report.source = source;
    const user = userEvent.setup();
    const rendered = renderEval();
    await screen.findByText('row 3');
    await user.click(screen.getByRole('tab', { name: 'Vulnerability Report' }));
    requests.length = 0;
    await user.click(
      source === 'framework'
        ? await screen.findByText('Hate Speech')
        : await screen.findByRole('button', { name: 'View logs' }),
    );

    await waitFor(() =>
      expect(rendered.container.querySelectorAll('table.results-table tbody tr')).toHaveLength(1),
    );
    expect(screen.getByText(source === 'policy' ? 'row 2' : 'row 0')).toBeInTheDocument();
    const query = new URL(requests[requests.length - 1], window.location.origin).searchParams;
    expect(query.get('filterMode')).toBe('failures');
    expect(JSON.parse(query.get('filter')!)).toMatchObject({
      type: source === 'policy' ? 'policy' : 'plugin',
      value: source === 'policy' ? '012345abcdef' : 'harmful:hate',
    });
    expect(Object.values(useTableStore.getState().filters.values)).toHaveLength(1);
  },
);

it('fetches a changed mode when a report reuses the same plugin filter', async () => {
  report.source = 'framework';
  const user = userEvent.setup();
  renderEval(`?filter=${encodeURIComponent(JSON.stringify(pluginFilter))}&mode=passes`);
  await screen.findByText('row 1');
  await user.click(screen.getByRole('tab', { name: 'Vulnerability Report' }));
  requests.length = 0;
  await user.click(await screen.findByText('Hate Speech'));

  await screen.findByText('row 0');
  expect(screen.queryByText('row 1')).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0], window.location.origin).searchParams.get('filterMode')).toBe(
    'failures',
  );
});

it('rehydrates URL filter clearing and reapplication without resetting UI-owned filter IDs', async () => {
  const user = userEvent.setup();
  const rendered = renderEval();
  await screen.findByText('row 3');
  await user.click(screen.getByRole('button', { name: 'Apply URL filter' }));
  await waitFor(() =>
    expect(rendered.container.querySelectorAll('table.results-table tbody tr')).toHaveLength(2),
  );
  await user.click(screen.getByRole('button', { name: 'Clear URL filters' }));
  await screen.findByText('row 3');
  expect(useTableStore.getState().filters.appliedCount).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Apply URL filter' }));
  await waitFor(() =>
    expect(rendered.container.querySelectorAll('table.results-table tbody tr')).toHaveLength(2),
  );

  const filter = Object.values(useTableStore.getState().filters.values)[0];
  requests.length = 0;
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  await user.click(screen.getByText('equals', { exact: true }).closest('button')!);
  await user.click(screen.getByRole('option', { name: 'not equals' }));
  await waitFor(() =>
    expect(new URLSearchParams(window.location.search).get('filter')).toContain('not_equals'),
  );
  await screen.findByText('row 3');
  expect(Object.keys(useTableStore.getState().filters.values)).toEqual([filter.id]);
  expect(requests).toHaveLength(1);
  expect(
    JSON.parse(new URL(requests[0], window.location.origin).searchParams.get('filter')!).operator,
  ).toBe('not_equals');
  await user.keyboard('{Escape}');
  requests.length = 0;
  await user.click(screen.getByRole('button', { name: 'Failures' }));
  await waitFor(() =>
    expect(rendered.container.querySelectorAll('table.results-table tbody tr')).toHaveLength(1),
  );
  expect(screen.getByText('row 2')).toBeInTheDocument();
  expect(Object.keys(useTableStore.getState().filters.values)).toEqual([filter.id]);
  expect(requests).toHaveLength(1);
  const query = new URL(requests[0], window.location.origin).searchParams;
  expect(query.get('filterMode')).toBe('failures');
  expect(query.get('limit')).toBe('50');
});
