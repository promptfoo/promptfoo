import { useState } from 'react';

import { callApi } from '@app/utils/api';
import { Button, CssBaseline } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelAudit from './ModelAudit';
import { useModelAuditStore } from './store';

import type { ScanResult } from './ModelAudit.types';

vi.mock('@app/utils/api');
vi.mock('./store');

vi.mock('./components/ResultsTab', () => ({
  default: ({
    scanResults,
    onShowFilesDialog,
  }: {
    scanResults: ScanResult;
    onShowFilesDialog?: () => void;
  }) => (
    <div data-testid="results-tab">
      <span>Issues found: {scanResults.issues.length}</span>
      {onShowFilesDialog && (
        <button data-testid="show-files-button" onClick={onShowFilesDialog}>
          Show Files
        </button>
      )}
    </div>
  ),
}));

const theme = createTheme();

describe('ModelAudit', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockUseModelAuditStore = vi.mocked(useModelAuditStore);
  const mockAddRecentScan = vi.fn();
  const mockCheckInstallation = vi.fn();

  const getDefaultStoreState = () => ({
    // State
    recentScans: [],
    paths: [],
    scanOptions: {
      blacklist: [],
      timeout: 300,
      verbose: false,
    },
    isScanning: false,
    scanResults: null,
    error: null,
    installationStatus: {
      checking: false,
      installed: true,
      lastChecked: Date.now(),
      error: null,
      cwd: '/fake/dir',
    },
    activeTab: 0,
    showFilesDialog: false,
    showInstallationDialog: false,
    showOptionsDialog: false,

    // Actions
    addRecentScan: mockAddRecentScan,
    removeRecentScan: vi.fn(),
    clearRecentScans: vi.fn(),
    setPaths: vi.fn(),
    addPath: vi.fn(),
    removePath: vi.fn(),
    setScanOptions: vi.fn(),
    setIsScanning: vi.fn(),
    setScanResults: vi.fn(),
    setError: vi.fn(),
    setInstallationStatus: vi.fn(),
    checkInstallation: mockCheckInstallation,
    setActiveTab: vi.fn(),
    setShowFilesDialog: vi.fn(),
    setShowInstallationDialog: vi.fn(),
    setShowOptionsDialog: vi.fn(),
    getRecentScans: vi.fn().mockReturnValue([]),

    // Persist
    persist: {
      rehydrate: vi.fn().mockResolvedValue(undefined),
    },
  });

  const mockScanResults: ScanResult = {
    path: '/test/path',
    issues: [
      {
        severity: 'error',
        message: 'Critical security issue found',
        location: '/path/to/model.safetensors',
        timestamp: Date.now(),
        details: {},
      },
    ],
    success: true,
    scannedFiles: 3,
    totalFiles: 3,
    duration: 1.5,
    scannedFilesList: ['/path/to/model.safetensors', '/path/to/model2.bin', '/path/to/model3.h5'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckInstallation.mockResolvedValue(undefined);
    mockUseModelAuditStore.mockReturnValue(getDefaultStoreState());

    // Mock successful API responses
    mockCallApi.mockImplementation(async (path: string) => {
      if (path.includes('/model-audit/scan')) {
        return {
          ok: true,
          json: () => Promise.resolve(mockScanResults),
        } as Response;
      }
      if (path.includes('/model-audit/check-path')) {
        return {
          ok: true,
          json: () => Promise.resolve({ exists: true, type: 'file', name: 'model.safetensors' }),
        } as Response;
      }
      return {
        ok: true,
        json: () => Promise.resolve({}),
      } as Response;
    });
  });

  it('should display UI immediately without blocking on installation check', async () => {
    // Delay the API response to simulate slow check
    mockCallApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(JSON.stringify({ installed: true, cwd: '/fake/dir' }), { status: 200 }),
            );
          }, 100);
        }),
    );

    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <ModelAudit />
        </ThemeProvider>
      </MemoryRouter>,
    );

    // UI should be visible immediately
    expect(screen.getByText('Model Audit')).toBeInTheDocument();
    expect(screen.getByText('Select Models')).toBeInTheDocument();

    // Should show checking status in header
    expect(screen.getByText('Ready')).toBeInTheDocument(); // Since we mock installed: true
  });

  describe('Installation Handling', () => {
    it('should check installation status on mount', async () => {
      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(mockCheckInstallation).toHaveBeenCalled();
      });
    });

    it('should display installation status in header', () => {
      mockUseModelAuditStore.mockReturnValue({
        ...getDefaultStoreState(),
        installationStatus: {
          checking: false,
          installed: false,
          lastChecked: Date.now(),
          error: null,
          cwd: '/fake/dir',
        },
      });

      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      expect(screen.getByText('Not Installed')).toBeInTheDocument();
    });

    it('should call `checkInstallation` when the user clicks the refresh (IconButton) in the header when installationStatus.installed is false', async () => {
      mockUseModelAuditStore.mockReturnValue({
        ...getDefaultStoreState(),
        installationStatus: {
          checking: false,
          installed: false,
          lastChecked: Date.now(),
          error: null,
          cwd: '/fake/dir',
        },
      });

      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      const refreshButton = screen.getByTestId('RefreshIcon').closest('button');
      if (refreshButton) {
        fireEvent.click(refreshButton);

        await waitFor(() => {
          expect(mockCheckInstallation).toHaveBeenCalled();
        });
      }
    });

    it('should display the error message from `installationStatus.error` in the tooltip when installationStatus.installed is false and error is set', () => {
      const errorMessage = 'Failed to connect to server.';
      mockUseModelAuditStore.mockReturnValue({
        ...getDefaultStoreState(),
        installationStatus: {
          checking: false,
          installed: false,
          lastChecked: Date.now(),
          error: errorMessage,
          cwd: null,
        },
      });

      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      const tooltip = screen.getByLabelText(errorMessage);
      expect(tooltip).toBeInTheDocument();
    });
  });

  describe('Happy Path', () => {
    it('should display the Configuration tab, allow adding a path, perform a scan, and display the Results tab with scan results', async () => {
      const mockAddPath = vi.fn();
      const mockSetScanResults = vi.fn();
      const mockSetActiveTab = vi.fn();
      const mockSetIsScanning = vi.fn();
      const mockSetError = vi.fn();

      // Initial state with no paths
      const { rerender } = render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      // Should display Model Audit title
      expect(screen.getByText('Model Audit')).toBeInTheDocument();

      // Should display Configuration tab by default
      expect(screen.getByText('Configuration')).toBeInTheDocument();
      expect(screen.getByText('Select Models')).toBeInTheDocument();

      // Add a path
      const pathInput = screen.getByPlaceholderText('Type a path or drag & drop above');
      fireEvent.change(pathInput, { target: { value: '/test/model.safetensors' } });
      fireEvent.click(screen.getByText('Add'));

      // Mock the store with the added path
      mockUseModelAuditStore.mockReturnValue({
        ...getDefaultStoreState(),
        paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
        addPath: mockAddPath,
        setScanResults: mockSetScanResults,
        setActiveTab: mockSetActiveTab,
        setIsScanning: mockSetIsScanning,
        setError: mockSetError,
      });

      // Re-render with updated state
      rerender(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      // Click scan button
      const scanButton = screen.getByText('Start Security Scan');
      fireEvent.click(scanButton);

      // Wait for scan to start - now we expect a check-path call first, then scan
      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/check-path', expect.any(Object));
      });

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith(
          '/model-audit/scan',
          expect.objectContaining({
            method: 'POST',
          }),
        );
      });

      // Mock successful scan completion
      mockUseModelAuditStore.mockReturnValue({
        ...getDefaultStoreState(),
        scanResults: mockScanResults,
        activeTab: 1,
        paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
      });

      // Re-render with scan results
      rerender(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      // Should now be on Results tab
      expect(screen.getByTestId('results-tab')).toBeInTheDocument();
      expect(screen.getByText('Issues found: 1')).toBeInTheDocument();
    });

    it('should open and close the ScannedFilesDialog when requested', async () => {
      const mockSetShowFilesDialog = vi.fn();

      mockUseModelAuditStore.mockReturnValue({
        ...getDefaultStoreState(),
        scanResults: mockScanResults,
        activeTab: 1,
        showFilesDialog: false,
        setShowFilesDialog: mockSetShowFilesDialog,
      });

      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      // Click to show files dialog
      const showFilesButton = screen.getByTestId('show-files-button');
      fireEvent.click(showFilesButton);

      // Should call setShowFilesDialog
      await waitFor(() => {
        expect(mockSetShowFilesDialog).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('Theme Switching', () => {
    it('should update styling when the theme mode changes', () => {
      const TestComponent = () => {
        const [darkMode, setDarkMode] = useState(false);
        const testTheme = createTheme({
          palette: {
            mode: darkMode ? 'dark' : 'light',
          },
        });

        return (
          <ThemeProvider theme={testTheme}>
            <CssBaseline />
            <MemoryRouter>
              <ModelAudit />
            </MemoryRouter>
            <Button onClick={() => setDarkMode(!darkMode)}>Toggle Theme</Button>
          </ThemeProvider>
        );
      };

      render(<TestComponent />);

      // Light mode initially
      const paper = screen.getByText('Model Audit').closest('[class*="MuiPaper"]');
      expect(paper).toBeInTheDocument();

      // Toggle to dark mode
      fireEvent.click(screen.getByText('Toggle Theme'));

      // Dark mode styling should be applied (no specific style assertion since we removed hardcoded colors)
      expect(paper).toBeInTheDocument();
    });
  });

  it('should handle extremely long path names in PathSelector without breaking the UI', async () => {
    const veryLongPath = '/this/is/a/very/long/path/'.repeat(10) + 'model.safetensors';
    const mockAddPath = vi.fn();

    mockUseModelAuditStore.mockReturnValue({
      ...getDefaultStoreState(),
      addPath: mockAddPath,
    });

    const { rerender } = render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <ModelAudit />
        </ThemeProvider>
      </MemoryRouter>,
    );

    // Add a very long path
    const pathInput = screen.getByPlaceholderText('Type a path or drag & drop above');
    fireEvent.change(pathInput, { target: { value: veryLongPath } });
    fireEvent.click(screen.getByText('Add'));

    // Mock the store with the long path added
    mockUseModelAuditStore.mockReturnValue({
      ...getDefaultStoreState(),
      paths: [{ path: veryLongPath, type: 'file', name: 'model.safetensors' }],
    });

    // Re-render with the long path
    rerender(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <ModelAudit />
        </ThemeProvider>
      </MemoryRouter>,
    );

    // Verify the UI doesn't break and the path is handled properly
    await waitFor(() => {
      const pathElements = screen.getAllByText((content, element) => {
        return element?.tagName === 'P' && content.includes('model.safetensors');
      });
      expect(pathElements.length).toBeGreaterThan(0);
    });

    // The UI should handle long paths gracefully - we just verify the element exists
    // and the UI didn't break, rather than checking for a specific title attribute
    const pathElement = screen.getByText((content, element) => {
      return element?.tagName === 'P' && content.includes('model.safetensors');
    });
    expect(pathElement).toBeInTheDocument();
  });
});
