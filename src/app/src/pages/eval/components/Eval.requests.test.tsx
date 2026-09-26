import { act } from 'react';

import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  return {
    default: () => (
      <ResultsTable
        columnVisibility={{}}
        failureFilter={{}}
        filterMode={filterMode.current}
        maxTextLength={100}
        onFailureFilterToggle={vi.fn()}
        showStats={false}
        wordBreak="break-word"
        zoom={1}
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
  const pending: Array<(response: Response) => void> = [];
  vi.mocked(callApi).mockImplementation(async (url) => {
    if (url.startsWith('/results')) {
      return { ok: true, json: async () => ({ data: [{ evalId: 'eval-id' }] }) } as Response;
    }
    return new Promise<Response>((resolve) => pending.push(resolve));
  });
  const resolveTableRequests = async () => {
    while (pending.length > 0) {
      await act(async () => {
        for (const resolve of pending.splice(0)) {
          resolve({
            ok: true,
            json: async () => ({
              table: { head: { prompts: [], vars: [] }, body: [] },
              config: {},
              version: 4,
              totalCount: 0,
              filteredCount: 0,
            }),
          } as Response);
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
