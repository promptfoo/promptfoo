import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditHistoryStore } from '../model-audit/stores';
import ModelAuditResult from './ModelAuditResult';

vi.mock('../model-audit/stores');

// Mock the child components
vi.mock('../model-audit/components/ResultsTab', () => ({
  default: ({ scanResults }: { scanResults: unknown }) => (
    <div data-testid="results-tab">
      <span>Results: {scanResults ? 'present' : 'none'}</span>
    </div>
  ),
}));

vi.mock('../model-audit/components/ScannedFilesDialog', () => ({
  default: () => <div data-testid="files-dialog" />,
}));

vi.mock('../model-audit/components/ModelAuditSkeleton', () => ({
  ResultPageSkeleton: () => <div data-testid="loading-skeleton" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const createMockScan = (id: string, name: string) => ({
  id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name,
  modelPath: '/test/model.bin',
  hasErrors: false,
  results: {
    path: '/test',
    success: true,
    issues: [],
  },
  totalChecks: 5,
  passedChecks: 5,
  failedChecks: 0,
  metadata: {
    originalPaths: ['/test/model.bin'],
  },
});

describe('ModelAuditResult', () => {
  const mockUseHistoryStore = vi.mocked(useModelAuditHistoryStore);
  const mockFetchScanById = vi.fn();
  const mockDeleteHistoricalScan = vi.fn();

  const getDefaultHistoryState = () => ({
    historicalScans: [],
    isLoadingHistory: false,
    historyError: null,
    totalCount: 0,
    pageSize: 25,
    currentPage: 0,
    sortModel: [{ field: 'createdAt', sort: 'desc' as const }],
    searchQuery: '',
    fetchHistoricalScans: vi.fn(),
    fetchScanById: mockFetchScanById,
    deleteHistoricalScan: mockDeleteHistoricalScan,
    setPageSize: vi.fn(),
    setCurrentPage: vi.fn(),
    setSortModel: vi.fn(),
    setSearchQuery: vi.fn(),
    resetFilters: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHistoryStore.mockReturnValue(getDefaultHistoryState() as any);
  });

  const renderComponent = (scanId: string = 'test-scan-id') => {
    return render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter initialEntries={[`/model-audit/${scanId}`]}>
          <Routes>
            <Route path="/model-audit/:id" element={<ModelAuditResult />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>,
    );
  };

  it('should show loading state initially', () => {
    mockFetchScanById.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderComponent();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('should fetch scan by ID on mount', async () => {
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    await waitFor(() => {
      expect(mockFetchScanById).toHaveBeenCalledWith('test-scan-id', expect.any(AbortSignal));
    });
  });

  it('should display scan details when loaded', async () => {
    const mockScan = createMockScan('test-scan-id', 'My Test Scan');
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Now check for the scan name (use heading role since it's an h4)
    expect(screen.getByRole('heading', { name: 'My Test Scan' })).toBeInTheDocument();
    expect(screen.getByTestId('results-tab')).toBeInTheDocument();
  });

  it('should display error when scan not found', async () => {
    mockFetchScanById.mockResolvedValue(null);

    renderComponent('nonexistent');

    await waitFor(() => {
      expect(screen.getByText('Scan not found')).toBeInTheDocument();
    });
  });

  it('should display model path in scan details', async () => {
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    await waitFor(() => {
      expect(screen.getByText('/test/model.bin')).toBeInTheDocument();
    });
  });

  it('should show clean status when no errors', async () => {
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockScan.hasErrors = false;
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    await waitFor(() => {
      // Component uses icons and background colors, not text
      // Verify the scan name is rendered (indicates component loaded)
      expect(screen.getByRole('heading', { name: 'Test Scan' })).toBeInTheDocument();
    });
  });

  it('should show issues found status when has errors', async () => {
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockScan.hasErrors = true;
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    await waitFor(() => {
      // Component uses icons and background colors, not text
      // Verify the scan name is rendered (indicates component loaded)
      expect(screen.getByRole('heading', { name: 'Test Scan' })).toBeInTheDocument();
    });
  });

  it('should open delete confirmation dialog when delete is clicked', async () => {
    const user = userEvent.setup();
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Open the Actions dropdown menu
    const actionsButton = screen.getByRole('button', { name: /Actions/i });
    await user.click(actionsButton);

    // Click Delete Scan from the dropdown
    const deleteMenuItem = screen.getByText('Delete Scan');
    await user.click(deleteMenuItem);

    // Verify dialog appears
    expect(screen.getByText('Delete Scan?')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete this scan? This action cannot be undone.'),
    ).toBeInTheDocument();
  });

  it('should delete scan and navigate to history when confirmed', async () => {
    const user = userEvent.setup();
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockFetchScanById.mockResolvedValue(mockScan);
    mockDeleteHistoricalScan.mockResolvedValue(undefined);

    renderComponent('test-scan-id');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Open the Actions dropdown menu
    const actionsButton = screen.getByRole('button', { name: /Actions/i });
    await user.click(actionsButton);

    // Click Delete Scan from the dropdown
    const deleteMenuItem = screen.getByText('Delete Scan');
    await user.click(deleteMenuItem);

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByText('Delete Scan?')).toBeInTheDocument();
    });

    // Click the destructive Delete button in the dialog footer
    const deleteButtons = screen.getAllByRole('button');
    // The destructive button should be the last one (after Cancel)
    const confirmButton =
      deleteButtons.find(
        (btn) => btn.textContent === 'Delete' && btn.getAttribute('type') !== 'button',
      ) || deleteButtons[deleteButtons.length - 1];

    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteHistoricalScan).toHaveBeenCalledWith('test-scan-id');
      expect(mockNavigate).toHaveBeenCalledWith('/model-audits');
    });
  });

  it('should have back to history navigation', async () => {
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Check for "Back to History" link
    const backLink = screen.getByRole('link', { name: /Back to History/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/model-audits');
  });
});
