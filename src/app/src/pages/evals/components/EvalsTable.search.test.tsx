import { TooltipProvider } from '@app/components/ui/tooltip';
import { getCallApiMock, mockCallApiRoutes } from '@app/tests/apiMocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalsTable from './EvalsTable';

vi.mock('@app/utils/api');

const EVALS = [
  {
    evalId: 'eval-newest',
    createdAt: 2,
    description: null,
    datasetId: null,
    isRedteam: false,
    label: 'eval-newest',
    numTests: 1,
    passRate: 100,
  },
  {
    evalId: 'eval-target',
    createdAt: 1,
    description: 'Persistent Python worker smoke test',
    datasetId: null,
    isRedteam: false,
    label: 'Persistent Python worker smoke test (eval-target)',
    numTests: 1,
    passRate: 100,
  },
];

/**
 * Stands in for `GET /api/results`. Search is applied here, exactly as the server does it,
 * because the evals table is server-paginated and only ever holds a window of rows.
 */
function mockResultsRoute() {
  return mockCallApiRoutes([
    {
      path: (path: string) => path.split('?')[0] === '/results',
      repeat: true,
      response: (path: string) => {
        const params = new URLSearchParams(path.split('?')[1] ?? '');
        const search = (params.get('search') ?? '').toLowerCase();
        const matches = EVALS.filter(
          (row) =>
            !search ||
            row.evalId.toLowerCase().includes(search) ||
            (row.description ?? '').toLowerCase().includes(search),
        );
        const offset = Number(params.get('offset') ?? 0);
        const limit = Number(params.get('limit') ?? matches.length);
        return {
          data: matches.slice(offset, offset + limit),
          pagination: { totalCount: matches.length, limit, offset },
        };
      },
    },
  ]);
}

describe('EvalsTable search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches displayed descriptions when the first row has no description', async () => {
    mockResultsRoute();

    render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <EvalsTable onEvalSelected={vi.fn()} showUtilityButtons />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await screen.findByText('Persistent Python worker smoke test');

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search evaluations' }),
      'Persistent Python',
    );

    await waitFor(() => {
      expect(screen.getByText('Persistent Python worker smoke test')).toBeInTheDocument();
      expect(screen.queryByText('eval-newest')).not.toBeInTheDocument();
    });
  });

  it('sends the search term to the server rather than filtering the loaded page', async () => {
    mockResultsRoute();

    render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <EvalsTable onEvalSelected={vi.fn()} showUtilityButtons />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await screen.findByText('Persistent Python worker smoke test');

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search evaluations' }),
      'Persistent Python',
    );

    await waitFor(() => {
      const searchedPaths = getCallApiMock()
        .mock.calls.map(([path]) => String(path))
        .filter((path) => path.includes('search='));
      expect(searchedPaths.length).toBeGreaterThan(0);
      expect(
        searchedPaths.some((path) =>
          new URLSearchParams(path.split('?')[1] ?? '')
            .get('search')
            ?.includes('Persistent Python'),
        ),
      ).toBe(true);
    });
  });
});
