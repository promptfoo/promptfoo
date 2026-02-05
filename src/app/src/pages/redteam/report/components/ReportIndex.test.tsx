import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportIndex from './ReportIndex';
import type { EvalSummary } from '@promptfoo/types';

vi.mock('@app/utils/api');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

// Mock the DataTable component to simplify testing
vi.mock('@app/components/data-table/data-table', () => ({
  DataTable: ({
    data,
    isLoading,
    error,
    onRowClick,
    columns,
  }: {
    data: EvalSummary[];
    isLoading: boolean;
    error: string | null;
    onRowClick: (row: EvalSummary) => void;
    columns: {
      accessorKey: string;
      header: string;
      cell: (props: { row: { original: EvalSummary }; getValue: () => unknown }) => React.ReactNode;
    }[];
  }) => {
    if (isLoading) {
      return <div data-testid="loading">Loading...</div>;
    }

    if (error) {
      return <div data-testid="error">{error}</div>;
    }

    if (data.length === 0) {
      return <div data-testid="empty">No data</div>;
    }

    return (
      <div data-testid="data-table" role="grid">
        {/* Render toolbar button for test */}
        <button>Select columns</button>
        {data.map((row) => (
          <div key={row.evalId} data-testid={`row-${row.evalId}`} role="row">
            {columns.map((col) => {
              const value = row[col.accessorKey as keyof EvalSummary];
              const cellContent = col.cell({
                row: { original: row },
                getValue: () => value,
              });
              return (
                <div key={col.accessorKey} role="gridcell" aria-label={String(value)}>
                  {cellContent}
                </div>
              );
            })}
            <button data-testid={`click-${row.evalId}`} onClick={() => onRowClick?.(row)}>
              Click row
            </button>
          </div>
        ))}
      </div>
    );
  },
}));

const mockData: EvalSummary[] = [
  {
    evalId: 'eval-1',
    datasetId: 'dataset-1',
    description: 'My First Redteam Report',
    providers: [{ id: 'openai:gpt-4', label: 'GPT-4' }],
    createdAt: new Date('2023-10-26T10:00:00.000Z').getTime(),
    passRate: 75.123,
    numTests: 100,
    attackSuccessRate: 25,
    label: 'My First Redteam Report',
    isRedteam: true,
  },
  {
    evalId: 'eval-2',
    datasetId: 'dataset-2',
    description: 'Another Security Scan',
    providers: [{ id: 'anthropic:claude-2', label: null }],
    createdAt: new Date('2023-10-27T12:30:00.000Z').getTime(),
    passRate: 100,
    numTests: 50,
    attackSuccessRate: 50,
    label: 'Another Security Scan',
    isRedteam: true,
  },
];

describe('ReportIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ReportsTable rendering', () => {
    it('should render all rows and columns with correct values for a given EvalSummary[] data', async () => {
      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockData }),
      } as Response);

      render(
        <MemoryRouter>
          <ReportIndex />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'My First Redteam Report' })).toBeInTheDocument();
      });

      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText(formatDataGridDate(mockData[0].createdAt))).toBeInTheDocument();
      expect(screen.getByText('25.00%')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('eval-1')).toBeInTheDocument();

      expect(screen.getByRole('link', { name: 'Another Security Scan' })).toBeInTheDocument();
      expect(screen.getByText('anthropic:claude-2')).toBeInTheDocument();
      expect(screen.getByText(formatDataGridDate(mockData[1].createdAt))).toBeInTheDocument();
      expect(screen.getByText('50.00%')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('eval-2')).toBeInTheDocument();
    });

    it('should render the toolbar', async () => {
      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockData }),
      } as Response);

      render(
        <MemoryRouter>
          <ReportIndex />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Select columns' })).toBeInTheDocument();
      });
    });

    it('should render "No target" when providers array is empty', async () => {
      const mockDataNoProviders: EvalSummary[] = [
        {
          evalId: 'eval-1',
          datasetId: 'dataset-1',
          description: 'Report with no providers',
          providers: [],
          createdAt: new Date('2023-10-26T10:00:00.000Z').getTime(),
          passRate: 75,
          numTests: 100,
          attackSuccessRate: 25,
          label: 'Report with no providers',
          isRedteam: true,
        },
      ];

      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockDataNoProviders }),
      } as Response);

      render(
        <MemoryRouter>
          <ReportIndex />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('No target')).toBeInTheDocument();
      });
    });

    it('should display "Untitled Evaluation" in the description column when description is missing', async () => {
      const mockDataNoDescription: EvalSummary[] = [
        {
          evalId: 'eval-3',
          datasetId: 'dataset-3',
          providers: [{ id: 'openai:gpt-3.5-turbo', label: 'GPT-3.5-Turbo' }],
          createdAt: new Date('2023-11-15T15:00:00.000Z').getTime(),
          passRate: 60,
          numTests: 80,
          attackSuccessRate: 25,
          label: 'Missing Description Report',
          isRedteam: true,
          description: '',
        },
      ];
      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockDataNoDescription }),
      } as Response);

      render(
        <MemoryRouter>
          <ReportIndex />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Untitled Evaluation' })).toBeInTheDocument();
      });
    });
  });

  describe('ReportsTable navigation', () => {
    it('should navigate to /reports?evalId={evalId} when a row is clicked', async () => {
      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockData }),
      } as Response);

      const navigate = vi.fn();
      vi.mocked(useNavigate).mockReturnValue(navigate);

      render(
        <MemoryRouter>
          <ReportIndex />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'My First Redteam Report' })).toBeInTheDocument();
      });

      const linkElement = screen.getByRole('link', { name: 'My First Redteam Report' });
      fireEvent.click(linkElement);

      expect(navigate).toHaveBeenCalledWith('/reports?evalId=eval-1');
    });
  });
});
