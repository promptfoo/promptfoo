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
      <span>Issues found: {(scanResults as any).summary.issuesFound.total}</span>
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

  const mockScanResults = {
    scannedFilesList: ['/path/to/model.safetensors'],
    results: {},
    summary: {
      filesScanned: 1,
      issuesFound: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        total: 1,
      },
    },
    errors: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseModelAuditStore.mockReturnValue({
      addRecentScan: mockAddRecentScan,
      recentScans: [],
      clearRecentScans: vi.fn(),
      removeRecentScan: vi.fn(),
      getRecentScans: vi.fn().mockReturnValue([]),
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

  it('should display a loading spinner and message when modelAuditInstalled is null', async () => {
    mockCallApi.mockResolvedValue(new Response(undefined, { status: 200 }));

    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <ModelAudit />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText('Checking ModelAudit installation...')).toBeInTheDocument();
    });
  });

  describe('Installation Check', () => {
    it('should render the InstallationCheck component when modelAuditInstalled is false', async () => {
      mockCallApi.mockImplementation(async (path) => {
        if (path.endsWith('/model-audit/check-installed')) {
          return new Response(JSON.stringify({ installed: false }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      });

      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('ModelAudit Not Installed')).toBeInTheDocument();
      });
    });
  });

  describe('Happy Path', () => {
    it('should display the Configuration tab, allow adding a path, perform a scan, and display the Results tab with scan results', async () => {
      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole('tab', { name: 'Configuration', selected: true }),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole('tab', { name: 'Results' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Start Security Scan' })).toBeDisabled();

      const pathInput = screen.getByRole('textbox');
      fireEvent.change(pathInput, { target: { value: '/path/to/model.safetensors' } });

      const addButton = screen.getByRole('button', { name: 'Add' });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('model.safetensors')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Start Security Scan' })).toBeEnabled();

      const scanButton = screen.getByRole('button', { name: 'Start Security Scan' });
      fireEvent.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText('Scanning...')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Results', selected: true })).toBeInTheDocument();
      });

      expect(screen.getByRole('tab', { name: 'Results' })).toBeEnabled();
      expect(screen.getByTestId('results-tab')).toBeInTheDocument();
      expect(screen.getByText('Issues found: 1')).toBeInTheDocument();

      expect(mockAddRecentScan).toHaveBeenCalledTimes(1);
      expect(mockAddRecentScan).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/path/to/model.safetensors',
          }),
        ]),
      );

      expect(mockCallApi).toHaveBeenCalledWith(
        '/model-audit/scan',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            paths: ['/path/to/model.safetensors'],
            options: { blacklist: [], timeout: 300, verbose: false },
          }),
        }),
      );
    });

    it('should open and close the ScannedFilesDialog when requested', async () => {
      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ModelAudit />
          </ThemeProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole('tab', { name: 'Configuration', selected: true }),
        ).toBeInTheDocument();
      });
      const pathInput = screen.getByRole('textbox');
      fireEvent.change(pathInput, { target: { value: '/path/to/model.safetensors' } });
      const addButton = screen.getByRole('button', { name: 'Add' });
      fireEvent.click(addButton);
      await waitFor(() => {
        expect(screen.getByText('model.safetensors')).toBeInTheDocument();
      });
      const scanButton = screen.getByRole('button', { name: 'Start Security Scan' });
      fireEvent.click(scanButton);
      await waitFor(() => {
        expect(screen.getByText('Scanning...')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Results', selected: true })).toBeInTheDocument();
      });

      const showFilesButton = screen.getByTestId('show-files-button');
      fireEvent.click(showFilesButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Scanned Files' })).toBeInTheDocument();
      });
      expect(screen.getByText('/path/to/model.safetensors')).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Scanned Files' })).not.toBeInTheDocument();
      });
    });
  });

  describe('Theme Switching', () => {
    it('should update styling when the theme mode changes', async () => {
      const TestComponent = () => {
        const [mode, setMode] = useState<'light' | 'dark'>('light');
        const theme = createTheme({ palette: { mode } });

        return (
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <MemoryRouter>
              <ModelAudit />
              <Button
                onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
                data-testid="theme-toggle-button"
              >
                Toggle Theme
              </Button>
            </MemoryRouter>
          </ThemeProvider>
        );
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(
          screen.getByRole('tab', { name: 'Configuration', selected: true }),
        ).toBeInTheDocument();
      });

      const tabsComponentElement = screen.getByRole('tab', { name: 'Configuration' });
      if (!tabsComponentElement) {
        throw new Error('Tabs component not found');
      }
      const tabsComponent = tabsComponentElement.closest('.MuiTabs-root');
      if (!tabsComponent) {
        throw new Error('MuiTabs-root not found');
      }

      const initialColor = window.getComputedStyle(tabsComponent).backgroundColor;

      const themeToggleButton = screen.getByTestId('theme-toggle-button');
      fireEvent.click(themeToggleButton);

      await waitFor(() => {
        const newColor = window.getComputedStyle(tabsComponent).backgroundColor;
        expect(newColor).not.toBe(initialColor);
      });
    });
  });

  it('should handle extremely long path names in PathSelector without breaking the UI', async () => {
    const longPath = 'very/long/path/'.repeat(20) + 'model.safetensors';

    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <ModelAudit />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: 'Configuration', selected: true }),
      ).toBeInTheDocument();
    });

    const pathInput = screen.getByRole('textbox');
    fireEvent.change(pathInput, { target: { value: longPath } });
    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('model.safetensors')).toBeInTheDocument();
    });

    expect(screen.getByText('model.safetensors')).toBeVisible();
  });
});
