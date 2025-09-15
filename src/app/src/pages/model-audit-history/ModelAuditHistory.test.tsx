import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditHistory from './ModelAuditHistory';
import { callApi } from '@app/utils/api';
import { useModelAuditHistoryStore } from '@app/pages/model-audit/stores';

vi.mock('@app/utils/api');
vi.mock('@app/pages/model-audit/stores');

describe('ModelAuditHistory', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockUseModelAuditHistoryStore = vi.mocked(useModelAuditHistoryStore);

  const scans = [
    {
      id: '1',
      name: 'Scan 1',
      modelPath: '/path/to/model1',
      createdAt: Date.now(),
      hasErrors: true,
      results: {
        issues: [
          { severity: 'critical', message: '' },
          { severity: 'error', message: '' },
          { severity: 'warning', message: '' },
        ],
      },
      totalChecks: 10,
      passedChecks: 8,
    },
    {
      id: '2',
      name: null,
      modelPath: '/path/to/model2',
      createdAt: Date.now() - 1000,
      hasErrors: false,
      results: { issues: [] },
      totalChecks: 5,
      passedChecks: 5,
    },
    {
      id: '3',
      name: 'Scan 3',
      modelPath: '/path/to/model3',
      createdAt: Date.now() - 2000,
      hasErrors: true,
      results: {
        issues: [{ severity: 'critical', message: '' }],
      },
      totalChecks: 3,
      passedChecks: 1,
    },
  ];

  beforeEach(() => {
    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: [],
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });
  });

  it('displays loading state initially', () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scans: [] }),
    } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: [],
      isLoadingHistory: true,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading model audit scans...')).toBeInTheDocument();
  });

  it('displays scans when data is loaded', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: scans,
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
      expect(screen.getByText(`Scan ${scans[1].id.slice(-8)}`)).toBeInTheDocument();
    });
  });

  it('displays error state when API call fails', async () => {
    mockCallApi.mockRejectedValue(new Error('Failed to fetch model audit scans'));

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: [],
      isLoadingHistory: false,
      historyError: 'Failed to fetch model audit scans',
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Error loading scans')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch model audit scans')).toBeInTheDocument();
    });
  });

  it('displays empty state when no scans exist', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scans: [] }),
    } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: [],
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('No scans found')).toBeInTheDocument();
    });
  });


  it('calls onScanSelected when a row is clicked', async () => {
    const onScanSelected = vi.fn();
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: scans,
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory onScanSelected={onScanSelected} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      fireEvent.click(screen.getByText('Scan 1'));
    });
    expect(onScanSelected).toHaveBeenCalledWith('1');
  });



  it('shows/hides utility buttons based on showUtilityButtons prop', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: scans,
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    const { rerender } = render(
      <MemoryRouter>
        <ModelAuditHistory showUtilityButtons={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Select columns')).toBeInTheDocument();
    });

    rerender(
      <MemoryRouter>
        <ModelAuditHistory showUtilityButtons={false} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Select columns')).not.toBeInTheDocument();
    });
  });

  it('filters out the focused scan from the displayed scans', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: scans,
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory focusedScanId="2" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText(`Scan ${scans[1].id.slice(-8)}`)).toBeNull();
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
      expect(screen.getByText('Scan 3')).toBeInTheDocument();
    });
  });


  it('gracefully handles row clicks when no onScanSelected callback is provided', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: scans,
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Scan 1'));

    expect(true).toBe(true);
  });

  it('updates the current page and page size, and fetches new scans when the user changes the pagination controls', async () => {
    const setCurrentPage = vi.fn();
    const setPageSize = vi.fn();
    const fetchHistoricalScans = vi.fn();

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: scans,
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans,
      setPageSize,
      setCurrentPage,
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );

    const pageSizeSelect = screen.getByLabelText(/rows per page/i);

    fireEvent.mouseDown(pageSizeSelect);
    const option25 = screen.getByText('25');
    fireEvent.click(option25);

    await waitFor(() => {
      expect(setPageSize).toHaveBeenCalledWith(25);
      expect(setCurrentPage).toHaveBeenCalledWith(0);
      expect(fetchHistoricalScans).toHaveBeenCalled();
    });
  });

  it('displays empty state when API returns empty scans but totalCount is non-zero', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scans: [], totalCount: 1 }),
    } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: [],
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('No scans found')).toBeInTheDocument();
    });
  });
});

describe('ModelAuditHistory - Malformed Data', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockUseModelAuditHistoryStore = vi.mocked(useModelAuditHistoryStore);

  it('handles scans with malformed issues data (undefined severity)', async () => {
    const scans = [
      {
        id: '3',
        name: 'Scan with Malformed Issues',
        modelPath: '/path/to/malformed/model',
        createdAt: Date.now(),
        hasErrors: true,
        results: {
          path: '/path/to/scan',
          success: true,
          issues: [
            { severity: undefined, message: 'Issue with undefined severity' },
            { severity: 'error', message: 'Normal error' },
          ],
          passed: 1,
          failed: 2,
          errors: [],
          alerts: [],
          results: [],
          version: '1.0',
        },
        totalChecks: 3,
        passedChecks: 1,
      },
    ];

    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);

    mockUseModelAuditHistoryStore.mockReturnValue({
      historicalScans: scans,
      isLoadingHistory: false,
      historyError: null,
      pageSize: 50,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
      fetchHistoricalScans: vi.fn(),
      setPageSize: vi.fn(),
      setCurrentPage: vi.fn(),
      setSortModel: vi.fn(),
      setSearchQuery: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Scan with Malformed Issues')).toBeInTheDocument();
      expect(screen.getByText('1 Error')).toBeInTheDocument();
      expect(screen.queryByText('undefined Critical')).not.toBeInTheDocument();
      expect(screen.queryByText('undefined Error')).not.toBeInTheDocument();
      expect(screen.queryByText('undefined Warning')).not.toBeInTheDocument();
    });
  });
});
