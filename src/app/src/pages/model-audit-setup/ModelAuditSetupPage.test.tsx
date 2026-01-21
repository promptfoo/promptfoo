import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditConfigStore, useModelAuditHistoryStore } from '../model-audit/stores';
import ModelAuditSetupPage from './ModelAuditSetupPage';

vi.mock('../model-audit/stores');

// Mock the child components to simplify testing
vi.mock('../model-audit/components/ConfigurationTab', () => ({
  default: ({ isScanning, onScan }: { isScanning: boolean; onScan: () => void }) => (
    <div data-testid="config-tab">
      <span>Scanning: {isScanning ? 'yes' : 'no'}</span>
      <button data-testid="scan-button" onClick={onScan}>
        Scan
      </button>
    </div>
  ),
}));

vi.mock('../model-audit/components/ResultsTab', () => ({
  default: ({ scanResults }: { scanResults: unknown }) => (
    <div data-testid="results-tab">
      <span>Results: {scanResults ? 'present' : 'none'}</span>
    </div>
  ),
}));

vi.mock('../model-audit/components/AdvancedOptionsDialog', () => ({
  default: () => <div data-testid="options-dialog" />,
}));

vi.mock('../model-audit/components/ScannedFilesDialog', () => ({
  default: () => <div data-testid="files-dialog" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ModelAuditSetupPage', () => {
  const mockUseConfigStore = vi.mocked(useModelAuditConfigStore);
  const mockUseHistoryStore = vi.mocked(useModelAuditHistoryStore);

  const mockCheckInstallation = vi.fn();
  const mockSetIsScanning = vi.fn();
  const mockSetError = vi.fn();
  const mockSetScanResults = vi.fn();
  const mockAddRecentScan = vi.fn();
  const mockSetPaths = vi.fn();
  const mockRemovePath = vi.fn();
  const mockSetScanOptions = vi.fn();
  const mockSetShowFilesDialog = vi.fn();
  const mockSetShowOptionsDialog = vi.fn();
  const mockFetchHistoricalScans = vi.fn();

  const getDefaultConfigState = () => ({
    paths: [],
    scanOptions: { blacklist: [], timeout: 3600 },
    isScanning: false,
    scanResults: null,
    error: null,
    installationStatus: {
      checking: false,
      installed: true,
      error: null,
      cwd: '/test/dir',
    },
    showFilesDialog: false,
    showOptionsDialog: false,
    setPaths: mockSetPaths,
    addPath: vi.fn(),
    removePath: mockRemovePath,
    setScanOptions: mockSetScanOptions,
    setIsScanning: mockSetIsScanning,
    setScanResults: mockSetScanResults,
    setError: mockSetError,
    setInstallationStatus: vi.fn(),
    checkInstallation: mockCheckInstallation,
    setShowFilesDialog: mockSetShowFilesDialog,
    setShowOptionsDialog: mockSetShowOptionsDialog,
    addRecentScan: mockAddRecentScan,
    removeRecentScan: vi.fn(),
    removeRecentPath: vi.fn(),
    clearRecentScans: vi.fn(),
    clearScanState: vi.fn(),
    getRecentScans: vi.fn(),
    recentScans: [],
    persist: {
      rehydrate: vi.fn().mockResolvedValue(undefined),
    },
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
    fetchScanById: vi.fn(),
    deleteHistoricalScan: vi.fn(),
    setPageSize: vi.fn(),
    setCurrentPage: vi.fn(),
    setSortModel: vi.fn(),
    setSearchQuery: vi.fn(),
    resetFilters: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckInstallation.mockResolvedValue(undefined);
    mockUseConfigStore.mockReturnValue(getDefaultConfigState() as any);
    mockUseHistoryStore.mockReturnValue(getDefaultHistoryState() as any);
  });

  const renderComponent = () => {
    return render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <ModelAuditSetupPage />
        </MemoryRouter>
      </TooltipProvider>,
    );
  };

  it('should render the setup page with title', () => {
    renderComponent();

    expect(screen.getByText('Model Audit Setup')).toBeInTheDocument();
    expect(screen.getByTestId('config-tab')).toBeInTheDocument();
  });

  it('should check installation on mount', async () => {
    renderComponent();

    await waitFor(() => {
      expect(mockCheckInstallation).toHaveBeenCalled();
    });
  });

  it('should display installation status as Ready when installed', () => {
    renderComponent();

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('should display Not Installed when not installed', () => {
    mockUseConfigStore.mockReturnValue({
      ...getDefaultConfigState(),
      installationStatus: {
        checking: false,
        installed: false,
        error: 'Not found',
        cwd: null,
      },
    } as any);

    renderComponent();

    expect(screen.getByText('Not Installed')).toBeInTheDocument();
  });

  it('should display Checking when checking installation', () => {
    mockUseConfigStore.mockReturnValue({
      ...getDefaultConfigState(),
      installationStatus: {
        checking: true,
        installed: null,
        error: null,
        cwd: null,
      },
    } as any);

    renderComponent();

    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('should display error alert when there is an error', () => {
    mockUseConfigStore.mockReturnValue({
      ...getDefaultConfigState(),
      error: 'Something went wrong',
    } as any);

    renderComponent();

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should show results tab when scan results are available', () => {
    mockUseConfigStore.mockReturnValue({
      ...getDefaultConfigState(),
      scanResults: {
        path: '/test',
        success: true,
        issues: [],
      },
    } as any);

    renderComponent();

    expect(screen.getByTestId('results-tab')).toBeInTheDocument();
    expect(screen.getByText('Scan Results')).toBeInTheDocument();
  });
});
