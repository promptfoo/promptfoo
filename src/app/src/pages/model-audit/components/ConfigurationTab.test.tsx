import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ScanResult } from '../ModelAudit.types';
import ConfigurationTab from './ConfigurationTab';

vi.mock('./PathSelector', () => ({
  default: () => <div data-testid="path-selector" />,
}));

vi.mock('./ResultsTab', () => ({
  default: ({
    scanResults,
    onShowFilesDialog,
  }: {
    scanResults: ScanResult;
    onShowFilesDialog?: () => void;
  }) => (
    <div data-testid="results-tab">
      <span>Issues found: {scanResults?.issues?.length || 0}</span>
      {onShowFilesDialog && (
        <button data-testid="show-files-button" onClick={onShowFilesDialog}>
          Show Files
        </button>
      )}
    </div>
  ),
}));

const theme = createTheme();

describe('ConfigurationTab', () => {
  const defaultProps = {
    paths: [],
    onAddPath: vi.fn(),
    onRemovePath: vi.fn(),
    onShowOptions: vi.fn(),
    onScan: vi.fn(),
    isScanning: false,
    error: null,
    onClearError: vi.fn(),
    currentWorkingDir: '/fake/dir',
    installationStatus: {
      checking: false,
      installed: true,
    },
    scanResults: null,
    onShowFilesDialog: vi.fn(),
  };

  it('should display inline scan results when scanResults are provided and not persisted', () => {
    const mockScanResults: ScanResult = {
      persisted: false,
      path: '/test/path',
      issues: [
        {
          severity: 'error',
          message: 'Critical issue',
          location: 'file.pkl',
          timestamp: Date.now(),
          details: {},
        },
      ],
      success: true,
      scannedFiles: 1,
      totalFiles: 1,
      duration: 1,
      scannedFilesList: ['file.pkl'],
    };

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...defaultProps} scanResults={mockScanResults} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Scan Results')).toBeInTheDocument();

    const resultsTab = screen.getByTestId('results-tab');
    expect(resultsTab).toBeInTheDocument();

    expect(resultsTab).toHaveTextContent('Issues found: 1');
  });

  it('should display ResultsTab with 0 issues when scanResults.issues is an empty array', () => {
    const mockScanResults: ScanResult = {
      persisted: false,
      path: '/test/path',
      issues: [],
      success: true,
      scannedFiles: 0,
      totalFiles: 0,
      duration: 0,
      scannedFilesList: [],
    };

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...defaultProps} scanResults={mockScanResults} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Scan Results')).toBeInTheDocument();

    const resultsTab = screen.getByTestId('results-tab');
    expect(resultsTab).toBeInTheDocument();

    expect(resultsTab).toHaveTextContent('Issues found: 0');
  });

  it('should not render ResultsTab when scanResults is explicitly null', () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...defaultProps} scanResults={null} />
      </ThemeProvider>,
    );

    expect(screen.queryByText('Scan Results')).toBeNull();

    expect(screen.queryByTestId('results-tab')).toBeNull();
  });

  it('should clear the error message when the error prop changes from non-null to null', async () => {
    const initialError = 'An error occurred';
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...defaultProps} error={initialError} />
      </ThemeProvider>,
    );

    expect(screen.getByText(initialError)).toBeInTheDocument();

    await act(() => {
      rerender(
        <ThemeProvider theme={theme}>
          <ConfigurationTab {...defaultProps} error={null} />
        </ThemeProvider>,
      );
    });

    expect(screen.queryByText(initialError)).toBeNull();
  });

  it('should pass and trigger the onShowFilesDialog prop to ResultsTab', () => {
    const mockScanResults: ScanResult = {
      persisted: false,
      path: '/test/path',
      issues: [],
      success: true,
      scannedFiles: 0,
      totalFiles: 0,
      duration: 0,
      scannedFilesList: [],
    };

    const onShowFilesDialogMock = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab
          {...defaultProps}
          scanResults={mockScanResults}
          onShowFilesDialog={onShowFilesDialogMock}
        />
      </ThemeProvider>,
    );

    const showFilesButton = screen.getByTestId('show-files-button');
    fireEvent.click(showFilesButton);

    expect(onShowFilesDialogMock).toHaveBeenCalledTimes(1);
  });

  it('should disable the scan button when installationStatus.installed is false', () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab
          {...defaultProps}
          installationStatus={{ checking: false, installed: false }}
          paths={[{ path: '/test/path', type: 'file', name: 'test.pkl' }]}
        />
      </ThemeProvider>,
    );

    const scanButton = screen.getByRole('button', { name: 'ModelAudit Not Installed' });
    expect(scanButton).toBeDisabled();
  });
});
