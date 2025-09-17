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
  DataGrid: ({ rows, loading, onCellClick }: any) => {
    if (loading) {
      return <div data-testid="data-grid-loading">Loading...</div>;
    }

    return (
      <div data-testid="data-grid">
        {rows.map((row: any) => (
          <button
            key={row.evalId}
            data-testid={`row-${row.evalId}`}
            onClick={() => onCellClick?.({ row })}
          >
            {row.description ?? 'Untitled Evaluation'}
          </button>
        ))}
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
      expect(mockCallApi).toHaveBeenCalledWith(
        '/results?type=redteam&includeProviders=true',
        { cache: 'no-store' },
      ),
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
});
