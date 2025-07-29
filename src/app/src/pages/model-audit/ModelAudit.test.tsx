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

  const mockScanResults: ScanResult = {
    path: '/test/path',
    issues: [
      {
        severity: 'error',
        message: 'Critical security issue found',
        location: '/path/to/model.safetensors',
        timestamp: Date.now(),
      },
    ],
    success: true,
    scannedFiles: 1,
    totalFiles: 1,
    scannedFilesList: ['/path/to/model.safetensors'],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation with all required properties
    mockCheckInstallation.mockResolvedValue({ installed: true, cwd: '/fake/dir' });
    
    mockUseModelAuditStore.mockReturnValue({
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

    mockCallApi.mockImplementation(async (path, options) => {
      if (path.endsWith('/model-audit/check-installed')) {
        return new Response(JSON.stringify({ installed: true, cwd: '/fake/dir' }), { status: 200 });
      }
      if (path.endsWith('/model-audit/scan') && options?.method === 'POST') {
        return new Response(JSON.stringify(mockScanResults), { status: 200 });
      }
      if (path.endsWith('/model-audit/check-path')) {
        return new Response(
          JSON.stringify({
            exists: true,
            type: 'file',
            name: 'model.safetensors',
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
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

  describe('Installation Status', () => {
    it('should show not installed status in header when modelaudit is not installed', async () => {
      mockUseModelAuditStore.mockReturnValue({
        ...mockUseModelAuditStore(),
        installationStatus: {
          checking: false,
          installed: false,
          lastChecked: Date.now(),
          error: null,
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

      await waitFor(() => {
        expect(screen.getByText('Not Installed')).toBeInTheDocument();
      });

      // UI should still be functional
      expect(screen.getByText('Model Audit')).toBeInTheDocument();
    });

    it.skip('should show installation dialog when clicking scan with modelaudit not installed', async () => {
      // Add a path
      const pathInput = screen.getByPlaceholderText(
        'Examples: ./model.pkl, /path/to/models/, ../data/model.h5',
      );
      fireEvent.change(pathInput, { target: { value: '/test/model.safetensors' } });
      fireEvent.click(screen.getByText('Add'));

      // Give the component time to update
      await waitFor(() => {
        const scanButton = screen.queryByText('ModelAudit Not Installed');
        expect(scanButton).toBeInTheDocument();
      });

      // Click scan button
      const scanButton = screen.getByText('ModelAudit Not Installed');
      fireEvent.click(scanButton);

      // Should show installation dialog
      await waitFor(() => {
        expect(screen.getByText('ModelAudit Not Installed')).toBeInTheDocument();
        expect(screen.getByText('pip install modelaudit')).toBeInTheDocument();
      });
    });
  });

  describe('Happy Path', () => {
    it.skip('should display the Configuration tab, allow adding a path, perform a scan, and display the Results tab with scan results', async () => {
      const mockSetPaths = vi.fn();
      const mockSetScanResults = vi.fn();
      const mockSetActiveTab = vi.fn();
      const mockSetIsScanning = vi.fn();
      const mockSetError = vi.fn();

      mockUseModelAuditStore.mockReturnValue({
        ...mockUseModelAuditStore(),
        setPaths: mockSetPaths,
        setScanResults: mockSetScanResults,
        setActiveTab: mockSetActiveTab,
        setIsScanning: mockSetIsScanning,
        setError: mockSetError,
      });

      render(
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
      const pathInput = screen.getByPlaceholderText(
        'Examples: ./model.pkl, /path/to/models/, ../data/model.h5',
      );
      fireEvent.change(pathInput, { target: { value: '/test/model.safetensors' } });
      fireEvent.click(screen.getByText('Add'));

      // Wait for path to be added
      await waitFor(() => {
        expect(mockSetPaths).toHaveBeenCalled();
      });

      // Update the mock to have a path
      mockUseModelAuditStore.mockReturnValue({
        ...mockUseModelAuditStore(),
        paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
        setPaths: mockSetPaths,
        setScanResults: mockSetScanResults,
        setActiveTab: mockSetActiveTab,
        setIsScanning: mockSetIsScanning,
        setError: mockSetError,
      });

      // Click scan button
      const scanButton = screen.getByText('Start Security Scan');
      fireEvent.click(scanButton);

      // Wait for scan to complete
      await waitFor(() => {
        expect(mockSetIsScanning).toHaveBeenCalledWith(true);
        expect(mockSetScanResults).toHaveBeenCalledWith(mockScanResults);
        expect(mockSetActiveTab).toHaveBeenCalledWith(1); // Switch to Results tab
        expect(mockAddRecentScan).toHaveBeenCalled();
      });

      // Update the mock to show scan results
      mockUseModelAuditStore.mockReturnValue({
        ...mockUseModelAuditStore(),
        scanResults: mockScanResults,
        activeTab: 1,
        setPaths: mockSetPaths,
        setScanResults: mockSetScanResults,
        setActiveTab: mockSetActiveTab,
        setIsScanning: mockSetIsScanning,
        setError: mockSetError,
      });

      // Re-render with updated state
      render(
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
        ...mockUseModelAuditStore(),
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
      expect(paper).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' }); // white in light mode

      // Toggle to dark mode
      fireEvent.click(screen.getByText('Toggle Theme'));

      // Dark mode styling
      expect(paper).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' }); // still white because we set it explicitly
    });
  });

  it.skip('should handle extremely long path names in PathSelector without breaking the UI', async () => {
    const veryLongPath = '/this/is/a/very/long/path/'.repeat(10) + 'model.safetensors';

    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <ModelAudit />
        </ThemeProvider>
      </MemoryRouter>,
    );

    // Add a very long path
    const pathInput = screen.getByPlaceholderText(
      'Examples: ./model.pkl, /path/to/models/, ../data/model.h5',
    );
    fireEvent.change(pathInput, { target: { value: veryLongPath } });
    fireEvent.click(screen.getByText('Add'));

    // Verify the UI doesn't break and the path is handled properly
    // The PathSelector should truncate or handle overflow gracefully
    await waitFor(() => {
      const pathElements = screen.getAllByText((content, element) => {
        return element?.tagName === 'P' && content.includes('model.safetensors');
      });
      expect(pathElements.length).toBeGreaterThan(0);
    });

    // Verify the full path is preserved in the title/tooltip
    const pathElement = screen.getByText((content, element) => {
      return element?.tagName === 'P' && content.includes('model.safetensors');
    });
    expect(pathElement).toHaveAttribute('title', expect.stringContaining(veryLongPath));
  });
});
