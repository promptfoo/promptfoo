import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChecksSection from './ChecksSection';
import ResultsTab from './ResultsTab';

import type { ScanResult } from '../ModelAudit.types';

vi.mock('./ChecksSection', () => ({
  default: vi.fn(() => <div data-testid="checks-section"></div>),
}));

const MockedChecksSection = vi.mocked(ChecksSection);

describe('ResultsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render findings with severity filter and action buttons', () => {
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

    render(<ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />);

    // Check heading with count
    expect(screen.getByText(/Findings/i)).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();

    // Check severity filter is rendered
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    // Check action buttons are rendered
    expect(screen.getByRole('button', { name: /CSV/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Raw/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Files/i })).toBeInTheDocument();

    // Check issues are displayed
    expect(screen.getByText('Critical issue')).toBeInTheDocument();
    expect(screen.getByText('Warning issue')).toBeInTheDocument();
  });

  it('should render issues grouped by severity', () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [
        { severity: 'error', message: 'Critical issue' },
        { severity: 'warning', message: 'Warning issue' },
        { severity: 'info', message: 'Info issue' },
      ],
      scannedFiles: 15,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();

    render(<ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />);

    // All issues should be visible
    expect(screen.getByText('Critical issue')).toBeInTheDocument();
    expect(screen.getByText('Warning issue')).toBeInTheDocument();
    expect(screen.getByText('Info issue')).toBeInTheDocument();

    // Check that severity badges are rendered
    expect(screen.getByText('Critical Issues')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('Informational')).toBeInTheDocument();
  });

  it('should show raw output dialog when Raw button is clicked', async () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [],
      scannedFiles: 0,
      rawOutput: 'raw output content',
    };
    const mockOnShowFilesDialog = vi.fn();
    const user = userEvent.setup();

    render(<ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />);

    const rawButton = screen.getByRole('button', { name: /Raw/i });
    await user.click(rawButton);

    // Dialog should appear with raw output (portaled to document)
    expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
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

    render(<ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />);

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

  it('should call onShowFilesDialog when Files button is clicked', async () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [],
      scannedFiles: 2,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();
    const user = userEvent.setup();

    render(<ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />);

    const filesButton = screen.getByRole('button', { name: /Files/i });
    await user.click(filesButton);

    expect(mockOnShowFilesDialog).toHaveBeenCalledTimes(1);
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
      <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />,
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
      <ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('should hide debug issues by default but show other severities', () => {
    const mockScanResults: ScanResult = {
      path: '/path/to/scan',
      success: true,
      issues: [
        { severity: 'error', message: 'Critical issue' },
        { severity: 'warning', message: 'Warning issue' },
        { severity: 'debug', message: 'Debug issue' },
      ],
      scannedFiles: 15,
      rawOutput: 'raw output',
    };
    const mockOnShowFilesDialog = vi.fn();

    render(<ResultsTab scanResults={mockScanResults} onShowFilesDialog={mockOnShowFilesDialog} />);

    // Critical and warning should be visible
    expect(screen.getByText('Critical issue')).toBeInTheDocument();
    expect(screen.getByText('Warning issue')).toBeInTheDocument();

    // Debug should be hidden by default
    expect(screen.queryByText('Debug issue')).not.toBeInTheDocument();

    // Count should show 2, not 3
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });
});
