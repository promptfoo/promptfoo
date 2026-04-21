import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditConfigStore, useModelAuditHistoryStore } from '../model-audit/stores';
import ModelAuditSetupPage from './ModelAuditSetupPage';

vi.mock('@app/utils/api');
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
  default: ({
    scannerCatalog = [],
    isLoadingScanners = false,
    scannerCatalogError = null,
  }: {
    scannerCatalog?: Array<{ id: string }>;
    isLoadingScanners?: boolean;
    scannerCatalogError?: string | null;
  }) => (
    <div data-testid="options-dialog">
      <span data-testid="scanner-count">{scannerCatalog.length}</span>
      <span data-testid="scanner-loading">{String(isLoadingScanners)}</span>
      <span data-testid="scanner-error">{scannerCatalogError ?? ''}</span>
    </div>
  ),
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
  const mockCallApi = vi.mocked(callApi);
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
    mockCallApi.mockReset();
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scanners: [] }),
    } as Response);
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

  it('should load scanner catalog when the options dialog is open', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          scanners: [
            {
              id: 'pickle',
              class: 'PickleScanner',
              description: 'Scans pickle files',
              extensions: ['.pkl'],
              dependencies: [],
            },
          ],
        }),
    } as Response);
    mockUseConfigStore.mockReturnValue({
      ...getDefaultConfigState(),
      showOptionsDialog: true,
    } as any);

    renderComponent();

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
    });
    await waitFor(() => {
      expect(screen.getByTestId('scanner-count')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('scanner-error')).toBeEmptyDOMElement();
  });

  describe('loadScannerCatalog', () => {
    it('should handle API error response with error body', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'API failure' }),
      } as Response);
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
      });
      await waitFor(() => {
        expect(screen.getByTestId('scanner-error')).toHaveTextContent('API failure');
      });
      expect(screen.getByTestId('scanner-count')).toHaveTextContent('0');
    });

    it('should handle API error response without error body', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response);
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
      });
      await waitFor(() => {
        expect(screen.getByTestId('scanner-error')).toHaveTextContent(
          'Unable to load scanner catalog',
        );
      });
      expect(screen.getByTestId('scanner-count')).toHaveTextContent('0');
    });

    it('should handle network error', async () => {
      mockCallApi.mockRejectedValueOnce(new Error('Network failure'));
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
      });
      await waitFor(() => {
        expect(screen.getByTestId('scanner-error')).toHaveTextContent('Network failure');
      });
      expect(screen.getByTestId('scanner-count')).toHaveTextContent('0');
    });

    it('should handle non-Error exceptions', async () => {
      mockCallApi.mockRejectedValueOnce('String error');
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
      });
      await waitFor(() => {
        expect(screen.getByTestId('scanner-error')).toHaveTextContent('Unable to load scanners');
      });
      expect(screen.getByTestId('scanner-count')).toHaveTextContent('0');
    });

    it('should handle missing scanners array in response', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
      });
      await waitFor(() => {
        expect(screen.getByTestId('scanner-count')).toHaveTextContent('0');
      });
      expect(screen.getByTestId('scanner-error')).toBeEmptyDOMElement();
    });

    it('should handle non-array scanners in response', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scanners: 'not-an-array' }),
      } as Response);
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
      });
      await waitFor(() => {
        expect(screen.getByTestId('scanner-count')).toHaveTextContent('0');
      });
      expect(screen.getByTestId('scanner-error')).toBeEmptyDOMElement();
    });

    it('should not load scanners when dialog is closed', async () => {
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: false,
      } as any);

      renderComponent();

      // Wait a bit to ensure no API call is made
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockCallApi).not.toHaveBeenCalledWith('/model-audit/scanners');
    });

    it('should show loading state before scanners load', async () => {
      // Create a promise that we can control
      let resolveApi: (value: any) => void;
      const apiPromise = new Promise((resolve) => {
        resolveApi = resolve;
      });

      mockCallApi.mockReturnValue(apiPromise as any);
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('scanner-loading')).toHaveTextContent('true');
      });

      // Resolve the API call
      resolveApi!({
        ok: true,
        json: () => Promise.resolve({ scanners: [] }),
      });

      await waitFor(() => {
        expect(screen.getByTestId('scanner-loading')).toHaveTextContent('false');
      });
    });

    it('should cancel loading if dialog is closed before API response', async () => {
      // Create a promise that resolves after a delay
      const delayedResponse = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({ scanners: [{ id: 'test' }] }),
          });
        }, 100);
      });

      mockCallApi.mockReturnValue(delayedResponse as any);

      // Start with dialog open
      const { rerender } = render(
        <TooltipProvider delayDuration={0}>
          <MemoryRouter>
            <ModelAuditSetupPage />
          </MemoryRouter>
        </TooltipProvider>,
      );

      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      rerender(
        <TooltipProvider delayDuration={0}>
          <MemoryRouter>
            <ModelAuditSetupPage />
          </MemoryRouter>
        </TooltipProvider>,
      );

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scanners');
      });

      // Close the dialog before response arrives
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: false,
      } as any);

      rerender(
        <TooltipProvider delayDuration={0}>
          <MemoryRouter>
            <ModelAuditSetupPage />
          </MemoryRouter>
        </TooltipProvider>,
      );

      // Wait for the API response to arrive
      await delayedResponse;

      // Give it time to potentially update state (which it shouldn't due to cancellation)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Scanner count should remain at initial value since update was cancelled
      expect(screen.getByTestId('scanner-count')).toHaveTextContent('0');
    });

    it('should clear previous error when reloading', async () => {
      // First load with error
      mockCallApi.mockRejectedValueOnce(new Error('First error'));
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      const { rerender } = renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('scanner-error')).toHaveTextContent('First error');
      });

      // Close dialog
      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: false,
      } as any);

      rerender(
        <TooltipProvider delayDuration={0}>
          <MemoryRouter>
            <ModelAuditSetupPage />
          </MemoryRouter>
        </TooltipProvider>,
      );

      // Reopen dialog with successful load
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scanners: [] }),
      } as Response);

      mockUseConfigStore.mockReturnValue({
        ...getDefaultConfigState(),
        showOptionsDialog: true,
      } as any);

      rerender(
        <TooltipProvider delayDuration={0}>
          <MemoryRouter>
            <ModelAuditSetupPage />
          </MemoryRouter>
        </TooltipProvider>,
      );

      // Error should be cleared (loading state clears it)
      await waitFor(() => {
        expect(screen.getByTestId('scanner-loading')).toHaveTextContent('true');
      });

      await waitFor(() => {
        expect(screen.getByTestId('scanner-error')).toBeEmptyDOMElement();
      });
    });
  });
});
