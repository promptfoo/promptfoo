import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows, loading, onCellClick, columns }: any) => {
    if (loading) {
      return <div data-testid="data-grid-loading">Loading...</div>;
    }

    return (
      <div data-testid="data-grid">
        {rows.map((row: any) => {
          const createdAtColumn = columns?.find((col: any) => col.field === 'createdAt');
          const formattedDate = createdAtColumn?.valueFormatter
            ? createdAtColumn.valueFormatter(row.createdAt)
            : row.createdAt;

          return (
            <button
              key={row.evalId ?? 'missing-id'}
              data-testid={`row-${row.evalId ?? 'missing-id'}`}
              onClick={() => onCellClick?.({ row })}
            >
              <span data-testid={`row-${row.evalId ?? 'missing-id'}-description`}>
                {row.description ?? 'Untitled Evaluation'}
              </span>
              {formattedDate && (
                <span data-testid={`row-${row.evalId ?? 'missing-id'}-createdAt`}>
                  {formattedDate}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  },
  GridToolbarContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  GridToolbarColumnsButton: () => null,
  GridToolbarDensitySelector: () => null,
  GridToolbarFilterButton: () => null,
  GridToolbarQuickFilter: () => null,
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';

import ReportIndex from './ReportIndex';

const mockSummaries = [
  {
    evalId: 'eval-1',
    description: 'First Report',
    providers: [{ id: 'provider-1', label: 'Provider One' }],
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    evalId: 'eval-2',
    description: 'Second Report',
    providers: [{ id: 'provider-2', label: 'Provider Two' }],
    createdAt: '2024-01-02T00:00:00.000Z',
  },
] as any[];

describe('ReportIndex', () => {
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  it('fetches redteam reports on mount and renders them', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockSummaries }),
    } as any);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/results?type=redteam&includeProviders=true', {
        cache: 'no-store',
      }),
    );

    expect(await screen.findByTestId('row-eval-1')).toHaveTextContent('First Report');
    expect(screen.getByTestId('row-eval-2')).toHaveTextContent('Second Report');
  });

  it('shows an error message when the API request fails', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: vi.fn(),
    } as any);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('500: Server Error');
  });

  it('navigates to the report detail page when a row is clicked', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockSummaries }),
    } as any);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    const firstRow = await screen.findByTestId('row-eval-1');
    fireEvent.click(firstRow);

    expect(mockNavigate).toHaveBeenCalledWith('/reports?evalId=eval-1');
  });

  it('handles malformed data from the API (missing evalId)', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [
          {
            evalId: 'eval-1',
            description: 'First Report',
            providers: [{ id: 'provider-1', label: 'Provider One' }],
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            description: 'Malformed Report',
            providers: [{ id: 'provider-2', label: 'Provider Two' }],
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      }),
    } as any);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/results?type=redteam&includeProviders=true', {
        cache: 'no-store',
      }),
    );

    expect(await screen.findByTestId('row-eval-1')).toHaveTextContent('First Report');
  });

  it('renders "Untitled Evaluation" when the report description is null', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [
          {
            evalId: 'eval-3',
            description: null,
            providers: [{ id: 'provider-3', label: 'Provider Three' }],
            createdAt: '2024-01-03T00:00:00.000Z',
          },
        ],
      }),
    } as any);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('row-eval-3')).toHaveTextContent('Untitled Evaluation');
  });

  it('formats the Scanned At column correctly', async () => {
    const mockSummaries = [
      {
        evalId: 'eval-1',
        description: 'First Report',
        providers: [{ id: 'provider-1', label: 'Provider One' }],
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        evalId: 'eval-2',
        description: 'Second Report',
        providers: [{ id: 'provider-2', label: 'Provider Two' }],
        createdAt: '2024-01-02T12:34:56.789Z',
      },
    ] as any[];

    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockSummaries }),
    } as any);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/results?type=redteam&includeProviders=true', {
        cache: 'no-store',
      }),
    );

    const firstRowCreatedAt = await screen.findByTestId('row-eval-1-createdAt');
    expect(firstRowCreatedAt).toHaveTextContent(formatDataGridDate(mockSummaries[0].createdAt));

    const secondRowCreatedAt = await screen.findByTestId('row-eval-2-createdAt');
    expect(secondRowCreatedAt).toHaveTextContent(formatDataGridDate(mockSummaries[1].createdAt));
  });
});
