import { createTheme, ThemeProvider } from '@mui/material/styles';
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

const theme = createTheme();

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
      <MemoryRouter initialEntries={[`/model-audit/${scanId}`]}>
        <ThemeProvider theme={theme}>
          <Routes>
            <Route path="/model-audit/:id" element={<ModelAuditResult />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
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
      expect(screen.getByText('Clean')).toBeInTheDocument();
    });
  });

  it('should show issues found status when has errors', async () => {
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockScan.hasErrors = true;
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    await waitFor(() => {
      expect(screen.getByText('Issues Found')).toBeInTheDocument();
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

    // Find and click the Delete button
    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    await user.click(deleteButton);

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

    // Open delete dialog
    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    await user.click(deleteButton);

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByText('Delete Scan?')).toBeInTheDocument();
    });

    // Get all delete buttons and find the one in the dialog (MuiButton-containedError)
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
    const confirmButton = deleteButtons.find(
      (btn) => btn.className.includes('contained') || btn.getAttribute('variant') === 'contained',
    );
    await user.click(confirmButton || deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(mockDeleteHistoricalScan).toHaveBeenCalledWith('test-scan-id');
      expect(mockNavigate).toHaveBeenCalledWith('/model-audit/history');
    });
  });

  it('should have breadcrumb navigation', async () => {
    const mockScan = createMockScan('test-scan-id', 'Test Scan');
    mockFetchScanById.mockResolvedValue(mockScan);

    renderComponent('test-scan-id');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Check for breadcrumb links
    const links = screen.getAllByRole('link');
    const modelAuditLink = links.find((link) => link.textContent === 'Model Audit');
    const historyLink = links.find((link) => link.textContent === 'History');
    expect(modelAuditLink).toBeInTheDocument();
    expect(historyLink).toBeInTheDocument();
  });
});
