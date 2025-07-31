import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ResultsTab from './ResultsTab';
import ScanStatistics from './ScanStatistics';
import SecurityFindings from './SecurityFindings';

import type { ScanResult } from '../ModelAudit.types';

vi.mock('./ScanStatistics', () => ({
  default: vi.fn(({ onSeverityClick }) => (
    <div data-testid="scan-statistics">
      <button data-testid="severity-button" onClick={() => onSeverityClick('error')}>
        Error
      </button>
    </div>
  )),
}));

vi.mock('./SecurityFindings', () => ({
  default: vi.fn(({ onToggleRawOutput }) => (
    <div data-testid="security-findings">
      <button data-testid="toggle-raw-output" onClick={onToggleRawOutput}>
        Toggle Raw Output
      </button>
    </div>
  )),
}));

const theme = createTheme();

describe('ResultsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render ScanStatistics and SecurityFindings with the correct props when provided with valid scanResults and onShowFilesDialog callback', () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [
        { severity: 'error', message: 'Critical issue' },
        { severity: 'warning', message: 'Warning issue' },
      ],
      scannedFiles: 15,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />
      </ThemeProvider>,
    );

    expect(ScanStatistics).toHaveBeenCalledTimes(1);
    expect(ScanStatistics).toHaveBeenCalledWith(
      {
        scanResults: mockScanResults,
        selectedSeverity: null,
        onSeverityClick: expect.any(Function),
        onFilesClick: mockOnShowFilesDialog,
      },
      {},
    );

    expect(SecurityFindings).toHaveBeenCalledTimes(1);
    expect(SecurityFindings).toHaveBeenCalledWith(
      {
        scanResults: mockScanResults,
        selectedSeverity: null,
        onSeverityChange: expect.any(Function),
        showRawOutput: false,
        onToggleRawOutput: expect.any(Function),
      },
      {},
    );
  });

  it('should update selectedSeverity and pass it to SecurityFindings when a severity is clicked in ScanStatistics', async () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [{ severity: 'error', message: 'Critical issue' }],
      scannedFiles: 15,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();
    const user = userEvent.setup();

    render(
      <ThemeProvider theme={theme}>
        <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />
      </ThemeProvider>,
    );

    const severityButton = screen.getByTestId('severity-button');
    await user.click(severityButton);

    expect(SecurityFindings).toHaveBeenCalledTimes(2);
    expect(SecurityFindings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scanResults: mockScanResults,
        selectedSeverity: 'error',
        onSeverityChange: expect.any(Function),
        showRawOutput: false,
        onToggleRawOutput: expect.any(Function),
      }),
      {},
    );
  });

  it('should toggle showRawOutput and pass the updated value to SecurityFindings when the raw output toggle is triggered', async () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [],
      scannedFiles: 0,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();
    const user = userEvent.setup();

    render(
      <ThemeProvider theme={theme}>
        <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />
      </ThemeProvider>,
    );

    const toggleButton = screen.getByTestId('toggle-raw-output');
    await user.click(toggleButton);

    expect(SecurityFindings).toHaveBeenCalledTimes(2);
    expect(SecurityFindings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scanResults: mockScanResults,
        selectedSeverity: null,
        onSeverityChange: expect.any(Function),
        showRawOutput: true,
        onToggleRawOutput: expect.any(Function),
      }),
      {},
    );
  });

  it('should handle malformed scanResults gracefully when scanResults.issues is undefined', () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [],
      scannedFiles: 15,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();

    const { container } = render(
      <ThemeProvider theme={theme}>
        <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />
      </ThemeProvider>,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('should toggle selectedSeverity to null when clicking on an already selected severity', async () => {
    const originalMock = vi.mocked(ScanStatistics);
    let currentSeverity: string | null = null;

    originalMock.mockImplementation(
      ({ scanResults, selectedSeverity, onSeverityClick, onFilesClick }) => {
        currentSeverity = selectedSeverity;

        return (
          <div data-testid="scan-statistics">
            <button
              data-testid="severity-button"
              onClick={() => onSeverityClick(currentSeverity === 'error' ? null : 'error')}
            >
              Click Severity
            </button>
          </div>
        );
      },
    );

    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [{ severity: 'error', message: 'Critical issue' }],
      scannedFiles: 15,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />
      </ThemeProvider>,
    );

    const severityButton = screen.getByTestId('severity-button');
    await userEvent.click(severityButton);

    await userEvent.click(severityButton);

    expect(ScanStatistics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scanResults: mockScanResults,
        selectedSeverity: null,
        onSeverityClick: expect.any(Function),
        onFilesClick: mockOnShowFilesDialog,
      }),
      {},
    );

    originalMock.mockReset();
  });
});
