import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvalSummary } from '@promptfoo/types';

import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import ReportIndex from './ReportIndex';

vi.mock('@app/utils/api');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

const mockData: EvalSummary[] = [
  {
    evalId: 'eval-1',
    datasetId: 'dataset-1',
    description: 'My First Redteam Report',
    providers: [{ id: 'openai:gpt-4', label: 'GPT-4' }],
    createdAt: new Date('2023-10-26T10:00:00.000Z').getTime(),
    passRate: 75.123,
    numTests: 100,
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
    label: 'Another Security Scan',
    isRedteam: true,
  },
];

describe('ReportIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ReportsDataGrid rendering', () => {
    it('should render all rows and columns with correct values and formatting for a given EvalSummary[] data and isLoading=false', async () => {
      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockData }),
      } as Response);

      render(
        <MemoryRouter>
          <ReportIndex />
        </MemoryRouter>,
      );

      const firstDescriptionCell = await screen.findByTestId('redteams-description-eval-1');
      expect(firstDescriptionCell).toHaveTextContent('My First Redteam Report');
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText(formatDataGridDate(mockData[0].createdAt))).toBeInTheDocument();
      expect(screen.getByText('75.12%')).toBeInTheDocument();
      const numTestsCell1 = screen.getAllByRole('gridcell', { name: '100' });
      expect(numTestsCell1.length).toBeGreaterThan(0);
      expect(await screen.findByTestId('redteams-eval-id-eval-1')).toHaveTextContent('eval-1');

      const secondDescriptionCell = await screen.findByTestId('redteams-description-eval-2');
      expect(secondDescriptionCell).toHaveTextContent('Another Security Scan');
      expect(screen.getByText('anthropic:claude-2')).toBeInTheDocument();
      expect(screen.getByText(formatDataGridDate(mockData[1].createdAt))).toBeInTheDocument();
      expect(screen.getByText('100.00%')).toBeInTheDocument();
      const numTestsCell2 = screen.getAllByRole('gridcell', { name: '50' });
      expect(numTestsCell2.length).toBeGreaterThan(0);
      expect(await screen.findByTestId('redteams-eval-id-eval-2')).toHaveTextContent('eval-2');
    });

    it('should render the CustomToolbar in the DataGrid toolbar slot', async () => {
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
      const mockData: EvalSummary[] = [
        {
          evalId: 'eval-1',
          datasetId: 'dataset-1',
          description: 'Report with no providers',
          providers: [],
          createdAt: new Date('2023-10-26T10:00:00.000Z').getTime(),
          passRate: 75,
          numTests: 100,
          label: 'Report with no providers',
          isRedteam: true,
        },
      ];

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
        expect(screen.getByText('No target')).toBeInTheDocument();
      });
    });

    it('should display "Untitled Evaluation" in the description column when description is missing', async () => {
      const mockData: EvalSummary[] = [
        {
          evalId: 'eval-3',
          datasetId: 'dataset-3',
          providers: [{ id: 'openai:gpt-3.5-turbo', label: 'GPT-3.5-Turbo' }],
          createdAt: new Date('2023-11-15T15:00:00.000Z').getTime(),
          passRate: 60,
          numTests: 80,
          label: 'Missing Description Report',
          isRedteam: true,
          description: '',
        },
      ];
      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockData }),
      } as Response);

      render(
        <MemoryRouter>
          <ReportIndex />
        </MemoryRouter>,
      );

      const untitledDescriptionCell = await screen.findByTestId('redteams-description-eval-3');
      expect(untitledDescriptionCell).toHaveTextContent('Untitled Evaluation');
    });
  });

  describe('ReportsDataGrid navigation', () => {
    it('should navigate to /reports?evalId={evalId} when a cell in a row is clicked and that row has a valid evalId', async () => {
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

      const descriptionCell = await screen.findByTestId('redteams-description-eval-1');
      fireEvent.click(descriptionCell);

      expect(navigate).toHaveBeenCalledWith('/reports?evalId=eval-1');
    });
  });
});
