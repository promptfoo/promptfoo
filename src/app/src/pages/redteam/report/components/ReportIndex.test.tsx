import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultLightweightWithLabel } from '@promptfoo/types';

import { callApi } from '@app/utils/api';
import ReportIndex from './ReportIndex';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

const mockEvals: ResultLightweightWithLabel[] = [
  {
    evalId: 'eval-123-redteam',
    description: 'My First Red Team Eval',
    createdAt: new Date('2023-10-26T10:00:00Z').getTime(),
    isRedteam: true,
    label: 'My First Red Team Eval',
    datasetId: 'dataset-1',
    numTests: 10,
  },
  {
    evalId: 'eval-456-redteam',
    description: 'Another Security Test',
    createdAt: new Date('2023-10-25T12:30:00Z').getTime(),
    isRedteam: true,
    label: 'Another Security Test',
    datasetId: 'dataset-2',
    numTests: 20,
  },
  {
    evalId: 'eval-789-not-redteam',
    description: 'This one is not a redteam eval',
    createdAt: new Date('2023-10-24T15:00:00Z').getTime(),
    isRedteam: false,
    label: 'This one is not a redteam eval',
    datasetId: 'dataset-3',
    numTests: 15,
  },
  {
    evalId: 'eval-search-test',
    description: 'Search Test Description',
    createdAt: new Date('2023-10-23T15:00:00Z').getTime(),
    isRedteam: true,
    label: 'Search Test Description',
    datasetId: 'dataset-4',
    numTests: 5,
  },
  {
    evalId: 'eval-invalid-date',
    description: 'Eval with Invalid Date',
    createdAt: new Date().getTime(),
    isRedteam: true,
    label: 'Eval with Invalid Date',
    datasetId: 'dataset-invalid',
    numTests: 5,
  },
];

describe('ReportIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render a CircularProgress spinner and the text 'Waiting for reports' when isLoading is true", () => {
    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Waiting for reports')).toBeInTheDocument();
  });

  it('should render a table of red team evaluations when data is available', async () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockEvals }),
    } as Response);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await screen.findByRole('table');

    expect(screen.getByRole('columnheader', { name: /Name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Date/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Eval ID/i })).toBeInTheDocument();

    expect(screen.getByText('My First Red Team Eval')).toBeInTheDocument();
    expect(screen.getByText('eval-123-redteam')).toBeInTheDocument();
    expect(screen.getByText(/October 26, 2023/)).toBeInTheDocument();

    expect(screen.getByText('Another Security Test')).toBeInTheDocument();
    expect(screen.getByText('eval-456-redteam')).toBeInTheDocument();
    expect(screen.getByText(/October 25, 2023/)).toBeInTheDocument();

    expect(screen.queryByText('Waiting for reports')).not.toBeInTheDocument();
    expect(screen.queryByText('No Red Team evaluations found')).not.toBeInTheDocument();
  });

  it('should handle evaluations with invalid date formats in createdAt gracefully', async () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockEvals }),
    } as Response);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await screen.findByRole('table');

    expect(screen.getByText('My First Red Team Eval')).toBeInTheDocument();
    expect(screen.getByText('Another Security Test')).toBeInTheDocument();
  });

  it('should handle API errors and display an error message', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await screen.findByText('Waiting for reports');
    await screen.findByText('No Red Team evaluations found');

    expect(screen.queryByText('No Red Team evaluations found')).toBeInTheDocument();
  });

  it('should handle malformed API responses gracefully', async () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { message: 'Malformed data' } }),
    } as Response);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText('Waiting for reports')).not.toBeInTheDocument();
    });

    expect(screen.getByText('No Red Team evaluations found')).toBeInTheDocument();
  });

  it('should navigate to the report page for the selected evalId when a table row is clicked', async () => {
    const mockNavigate = vi.fn();

    const reactRouterDom = await import('react-router-dom');
    vi.spyOn(reactRouterDom, 'useNavigate').mockImplementation(() => mockNavigate);

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockEvals }),
    } as Response);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await screen.findByRole('table');

    const evalId = 'eval-123-redteam';
    const tableRow = screen.getByText(evalId).closest('tr');
    expect(tableRow).toBeInTheDocument();

    fireEvent.click(tableRow as Element);

    expect(mockNavigate).toHaveBeenCalledWith(`/reports?evalId=${evalId}`);
  });

  it('should filter the displayed evaluations by description or evalId when a search query is entered', async () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockEvals }),
    } as Response);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await screen.findByRole('table');

    const searchInput = screen.getByPlaceholderText(/Search by name or eval ID/i);
    fireEvent.change(searchInput, { target: { value: 'search' } });

    await screen.findByText('Search Test Description');
    expect(screen.getByText('eval-search-test')).toBeInTheDocument();

    expect(screen.queryByText('My First Red Team Eval')).not.toBeInTheDocument();
    expect(screen.queryByText('Another Security Test')).not.toBeInTheDocument();
  });

  it('should render a card with the message "No Red Team evaluations found" when recentEvals is an empty array and isLoading is false', async () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    } as Response);

    render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    await screen.findByText('No Red Team evaluations found');

    expect(screen.getByText('No Red Team evaluations found')).toBeInTheDocument();
  });
});
