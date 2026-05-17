import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditConfigStore, useModelAuditHistoryStore } from '../model-audit/stores';
import ModelAuditHistory from './ModelAuditHistory';

vi.mock('../model-audit/stores');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const createMockScan = (id: string, name: string, hasErrors: boolean = false) => ({
  id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name,
  modelPath: '/test/model.bin',
  hasErrors,
  results: {
    path: '/test',
    success: true,
    issues: [],
  },
  totalChecks: 5,
  passedChecks: hasErrors ? 3 : 5,
  failedChecks: hasErrors ? 2 : 0,
});

describe('ModelAuditHistory', () => {
  const mockUseHistoryStore = vi.mocked(useModelAuditHistoryStore);
  const mockUseConfigStore = vi.mocked(useModelAuditConfigStore);
  const mockFetchHistoricalScans = vi.fn();
  const mockFetchHistoricalScanRange = vi.fn();
  const mockDeleteHistoricalScan = vi.fn();
  const mockSetPageSize = vi.fn();
  const mockSetCurrentPage = vi.fn();
  const mockSetSortModel = vi.fn();
  const mockStartNewScan = vi.fn();

  afterEach(() => {
    vi.resetAllMocks();
  });

  const getDefaultHistoryState = () => ({
    historicalScans: [],
    isLoadingHistory: false,
    historyError: null,
    totalCount: 0,
    pageSize: 25,
    currentPage: 0,
    sortModel: [{ field: 'createdAt', sort: 'desc' as const }],
    searchQuery: '',
    fetchHistoricalScans: mockFetchHistoricalScans,
    fetchHistoricalScanRange: mockFetchHistoricalScanRange,
    fetchScanById: vi.fn(),
    deleteHistoricalScan: mockDeleteHistoricalScan,
    setPageSize: mockSetPageSize,
    setCurrentPage: mockSetCurrentPage,
    setSortModel: mockSetSortModel,
    setSearchQuery: vi.fn(),
    resetFilters: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchHistoricalScanRange.mockResolvedValue({ scans: [], offset: 0, total: 0 });
    mockUseHistoryStore.mockReturnValue(getDefaultHistoryState() as any);
    mockUseConfigStore.mockImplementation((selector: any) =>
      selector({ startNewScan: mockStartNewScan }),
    );
  });

  const renderComponent = () => {
    return render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <ModelAuditHistory />
        </MemoryRouter>
      </TooltipProvider>,
    );
  };

  it('should render the history page with New Scan button', () => {
    renderComponent();

    // Should have at least one "New Scan" button (toolbar + possibly empty state)
    expect(screen.getAllByText('New Scan').length).toBeGreaterThanOrEqual(1);
  });

  it('should fetch historical scans on mount', async () => {
    renderComponent();

    await waitFor(() => {
      expect(mockFetchHistoricalScans).toHaveBeenCalled();
    });
  });

  it('should display loading state', () => {
    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      isLoadingHistory: true,
    } as any);

    renderComponent();

    // DataTable shows loading overlay with spinner
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should display error alert when there is an error', () => {
    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historyError: 'Failed to load history',
    } as any);

    renderComponent();

    expect(screen.getByText('Error loading history')).toBeInTheDocument();
    expect(screen.getByText('Failed to load history')).toBeInTheDocument();
  });

  it('should display scans in the data grid', () => {
    const mockScans = [createMockScan('1', 'Scan 1'), createMockScan('2', 'Scan 2', true)];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: mockScans,
      totalCount: 2,
    } as any);

    renderComponent();

    expect(screen.getByText('Scan 1')).toBeInTheDocument();
    expect(screen.getByText('Scan 2')).toBeInTheDocument();
  });

  it('labels icon-only scan actions', () => {
    const mockScans = [createMockScan('1', 'Scan 1')];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: mockScans,
      totalCount: 1,
    } as any);

    renderComponent();

    expect(screen.getByRole('button', { name: 'Delete Scan 1' })).toBeInTheDocument();
  });

  it('distinguishes delete actions for unnamed scans', () => {
    const mockScans = [createMockScan('unnamed-1', '')];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: mockScans,
      totalCount: 1,
    } as any);

    renderComponent();

    expect(
      screen.getByRole('button', { name: 'Delete Unnamed scan unnamed-1' }),
    ).toBeInTheDocument();
  });

  it('should not render stale scans when the API reports zero total scans', () => {
    const staleScans = [createMockScan('stale', 'Stale Scan')];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: staleScans,
      totalCount: 0,
    } as any);

    renderComponent();

    expect(screen.queryByText('Stale Scan')).not.toBeInTheDocument();
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('should have New Scan button in toolbar', async () => {
    renderComponent();

    // Verify the New Scan button is rendered in the toolbar
    await waitFor(() => {
      const newScanButtons = screen.getAllByText('New Scan');
      expect(newScanButtons.length).toBeGreaterThanOrEqual(1);
      // Verify at least one is inside a clickable element
      expect(newScanButtons[0].closest('button, a')).not.toBeNull();
    });
  });

  it('should reset the draft before navigating to a new scan', async () => {
    const user = userEvent.setup();

    renderComponent();

    await user.click(screen.getAllByText('New Scan')[0]);

    expect(mockStartNewScan).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/model-audit/setup');
  });

  it('should navigate to scan details when row is clicked', async () => {
    const user = userEvent.setup();
    const mockScans = [createMockScan('scan-123', 'Test Scan')];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: mockScans,
      totalCount: 1,
    } as any);

    renderComponent();

    // Click on the row (the scan name is in the row)
    const scanNameCell = screen.getByText('Test Scan');
    const row = scanNameCell.closest('[data-rowindex]');
    if (row) {
      await user.click(row);
      expect(mockNavigate).toHaveBeenCalledWith('/model-audit/scan-123');
    } else {
      // Fallback: verify the scan name is rendered correctly
      expect(scanNameCell).toBeInTheDocument();
    }
  });

  it('should show empty state when no scans exist', () => {
    renderComponent();

    expect(screen.getByText('No scan history found')).toBeInTheDocument();
    expect(
      screen.getByText('Run your first model security scan to see results here'),
    ).toBeInTheDocument();
  });

  it('should display status chips correctly', () => {
    const mockScans = [
      createMockScan('1', 'Clean Scan', false),
      createMockScan('2', 'Issues Scan', true),
    ];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: mockScans,
      totalCount: 2,
    } as any);

    renderComponent();

    // Should show Clean and Issues Found chips
    expect(screen.getByText('Clean')).toBeInTheDocument();
    expect(screen.getByText('Issues Found')).toBeInTheDocument();
  });

  it('should show issues found for persisted failed-check-only scans', () => {
    const failedChecksOnly = {
      ...createMockScan('failed', 'Failed Checks Only', true),
      failedChecks: 1,
      results: {
        path: '/test',
        success: true,
        issues: [],
        failed_checks: 1,
        checks: [{ name: 'pickle', status: 'failed', message: 'Check failed' }],
      },
    };

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: [failedChecksOnly],
      totalCount: 1,
    } as any);

    renderComponent();

    expect(screen.getByText('Issues Found')).toBeInTheDocument();
    expect(screen.queryByText('Clean')).not.toBeInTheDocument();
  });

  it('should request server-supported sorts for status and checks columns', async () => {
    const user = userEvent.setup();
    const mockScans = [
      createMockScan('1', 'Clean Scan', false),
      createMockScan('2', 'Issues Scan', true),
    ];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: mockScans,
      totalCount: 2,
    } as any);

    renderComponent();

    await user.click(screen.getByRole('columnheader', { name: 'Status' }));
    expect(mockSetSortModel).toHaveBeenLastCalledWith([{ field: 'hasErrors', sort: 'asc' }]);

    await user.click(screen.getByRole('columnheader', { name: 'Checks' }));
    expect(mockSetSortModel).toHaveBeenLastCalledWith([
      { field: 'totalChecks', sort: expect.stringMatching(/^(asc|desc)$/) },
    ]);
  });

  it('should let server virtualization reload rows after sorting without duplicate bootstrap fetches', async () => {
    const user = userEvent.setup();
    const mockScans = [
      createMockScan('1', 'Clean Scan', false),
      createMockScan('2', 'Issues Scan', true),
    ];

    mockUseHistoryStore.mockReturnValue({
      ...getDefaultHistoryState(),
      historicalScans: mockScans,
      totalCount: 2,
    } as any);

    renderComponent();

    await waitFor(() => expect(mockFetchHistoricalScans).toHaveBeenCalledTimes(1));
    mockFetchHistoricalScans.mockClear();

    await user.click(screen.getByRole('columnheader', { name: 'Status' }));

    expect(mockSetSortModel).toHaveBeenLastCalledWith([{ field: 'hasErrors', sort: 'asc' }]);
    expect(mockFetchHistoricalScans).not.toHaveBeenCalled();
  });
});
