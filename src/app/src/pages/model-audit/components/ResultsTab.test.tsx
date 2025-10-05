import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ResultsTab from './ResultsTab';
import ScanStatistics from './ScanStatistics';
import SecurityFindings from './SecurityFindings';
import ChecksSection from './ChecksSection';

import type { ScanResult, ScanIssue } from '../ModelAudit.types';

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

vi.mock('./ChecksSection', () => ({
  default: vi.fn(() => <div data-testid="checks-section"></div>),
}));

const MockedScanStatistics = vi.mocked(ScanStatistics);
const MockedSecurityFindings = vi.mocked(SecurityFindings);
const MockedChecksSection = vi.mocked(ChecksSection);

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

    expect(MockedScanStatistics).toHaveBeenCalledTimes(1);
    expect(MockedScanStatistics.mock.calls[0][0]).toMatchObject({
      scanResults: mockScanResults,
      selectedSeverity: null,
      onSeverityClick: expect.any(Function),
      onFilesClick: mockOnShowFilesDialog,
    });

    expect(MockedSecurityFindings).toHaveBeenCalledTimes(1);
    expect(MockedSecurityFindings.mock.calls[0][0]).toMatchObject({
      scanResults: mockScanResults,
      selectedSeverity: null,
      onSeverityChange: expect.any(Function),
      showRawOutput: false,
      onToggleRawOutput: expect.any(Function),
    });
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

    expect(MockedSecurityFindings).toHaveBeenCalledTimes(2);
    expect(MockedSecurityFindings.mock.lastCall?.[0]).toMatchObject({
      scanResults: mockScanResults,
      selectedSeverity: 'error',
      onSeverityChange: expect.any(Function),
      showRawOutput: false,
      onToggleRawOutput: expect.any(Function),
    });
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

    expect(MockedSecurityFindings).toHaveBeenCalledTimes(2);
    expect(MockedSecurityFindings.mock.lastCall?.[0]).toMatchObject({
      scanResults: mockScanResults,
      selectedSeverity: null,
      onSeverityChange: expect.any(Function),
      showRawOutput: true,
      onToggleRawOutput: expect.any(Function),
    });
  });

  it('should render ChecksSection with the correct props when scanResults contains security check data', () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [],
      scannedFiles: 15,
      rawOutput: 'raw output',
      checks: [{ name: 'Check 1', status: 'passed', message: 'Check passed' }],
      total_checks: 10,
      passed_checks: 8,
      failed_checks: 2,
      assets: [{ path: '/path/to/asset', type: 'model' }],
      files_scanned: 5,
    };
    const mockOnShowFilesDialog = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />
      </ThemeProvider>,
    );

    expect(MockedChecksSection).toHaveBeenCalledTimes(1);
    expect(MockedChecksSection.mock.calls[0][0]).toMatchObject({
      checks: mockScanResults.checks,
      totalChecks: mockScanResults.total_checks,
      passedChecks: mockScanResults.passed_checks,
      failedChecks: mockScanResults.failed_checks,
      assets: mockScanResults.assets,
      filesScanned: mockScanResults.files_scanned,
    });
  });

  it('should render the scanned files section and display file names and issue counts when scanResults.scannedFilesList is present and non-empty', () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [
        { severity: 'error', message: 'Critical issue', location: 'file1.txt' },
        { severity: 'warning', message: 'Warning issue', location: 'file1.txt' },
        { severity: 'info', message: 'Info issue', location: 'file1.txt' },
        { severity: 'error', message: 'Critical issue', location: 'file2.txt' },
        { severity: 'warning', message: 'Warning issue', location: 'file2.txt' },
        { severity: 'info', message: 'Info issue', location: 'file2.txt' },
      ] as ScanIssue[],
      scannedFiles: 2,
      rawOutput: 'raw output',
      scannedFilesList: ['file1.txt', 'file2.txt'],
    };
    const mockOnShowFilesDialog = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Scanned Files (2)')).toBeInTheDocument();
    expect(screen.getAllByText('file1.txt')[0]).toBeInTheDocument();
    expect(screen.getAllByText('file2.txt')[0]).toBeInTheDocument();

    expect(screen.getAllByText('1 critical').length).toBe(2);
    expect(screen.getAllByText('1 warning').length).toBe(2);
    expect(screen.getAllByText('1 info').length).toBe(2);
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

  it('should handle malformed scanResults gracefully when scanResults.checks is undefined', () => {
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

    expect(MockedScanStatistics.mock.lastCall?.[0]).toMatchObject({
      scanResults: mockScanResults,
      selectedSeverity: null,
      onSeverityClick: expect.any(Function),
      onFilesClick: mockOnShowFilesDialog,
    });

    originalMock.mockReset();
  });
});
