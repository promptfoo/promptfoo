import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ScanResult, ScanIssue } from '../ModelAudit.types';
import ScanStatistics from './ScanStatistics';

const createMockScanResults = ({
  issues = [],
  scannedFiles = 1,
  path = 'mock/path',
  success = true,
}: {
  issues?: ScanIssue[];
  scannedFiles?: number;
  path?: string;
  success?: boolean;
} = {}): ScanResult => ({
  path,
  success,
  issues,
  scannedFiles,
  rawOutput: '',
});

const renderScanStatistics = (
  scanResults: ScanResult,
  selectedSeverity: string | null = null,
  onSeverityClick = vi.fn(),
  onFilesClick = vi.fn(),
) => {
  const theme = createTheme();
  return render(
    <ThemeProvider theme={theme}>
      <ScanStatistics
        scanResults={scanResults}
        selectedSeverity={selectedSeverity}
        onSeverityClick={onSeverityClick}
        onFilesClick={onFilesClick}
      />
    </ThemeProvider>,
  );
};

describe('ScanStatistics', () => {
  const mockOnSeverityClick = vi.fn();
  const mockOnFilesClick = vi.fn();

  it('should display correct counts and labels for all severities and scanned files', () => {
    const mockScanResults = createMockScanResults({
      issues: [
        { severity: 'error', message: 'Critical issue 1' } as ScanIssue,
        { severity: 'error', message: 'Critical issue 2' } as ScanIssue,
        { severity: 'warning', message: 'Warning issue 1' } as ScanIssue,
        { severity: 'info', message: 'Info issue 1' } as ScanIssue,
        { severity: 'info', message: 'Info issue 2' } as ScanIssue,
        { severity: 'info', message: 'Info issue 3' } as ScanIssue,
      ],
      scannedFiles: 125,
    });

    renderScanStatistics(mockScanResults, null, mockOnSeverityClick, mockOnFilesClick);

    const criticalCard = screen.getByText('Critical').closest('div');
    expect(criticalCard).toHaveTextContent('2');

    const warningsCard = screen.getByText('Warnings').closest('div');
    expect(warningsCard).toHaveTextContent('1');

    const informationCard = screen.getByText('Information').closest('div');
    expect(informationCard).toHaveTextContent('3');

    const filesScannedCard = screen.getByText('Files Scanned').closest('div');
    expect(filesScannedCard).toHaveTextContent('125');
  });

  it('should call onSeverityClick with the correct severity value when a severity StatCard is clicked', () => {
    const mockScanResults = createMockScanResults({
      issues: [{ severity: 'error', message: 'Critical issue' } as ScanIssue],
    });

    renderScanStatistics(mockScanResults, null, mockOnSeverityClick, mockOnFilesClick);

    const criticalCard = screen.getByText('Critical').closest('div');
    fireEvent.click(criticalCard as HTMLElement);

    expect(mockOnSeverityClick).toHaveBeenCalledWith('error');
  });

  it('should call onSeverityClick with null when the currently selected severity StatCard is clicked again', () => {
    const mockScanResults = createMockScanResults({
      issues: [{ severity: 'warning', message: 'Warning issue 1' } as ScanIssue],
      scannedFiles: 100,
    });
    const selectedSeverity = 'warning';

    renderScanStatistics(mockScanResults, selectedSeverity, mockOnSeverityClick, mockOnFilesClick);

    const warningsCard = screen.getByText('Warnings').closest('div');
    fireEvent.click(warningsCard as Element);

    expect(mockOnSeverityClick).toHaveBeenCalledWith(null);
  });

  it('should call onFilesClick when the Files Scanned StatCard is clicked', () => {
    const mockScanResults = createMockScanResults({
      scannedFiles: 125,
    });

    renderScanStatistics(mockScanResults, null, mockOnSeverityClick, mockOnFilesClick);

    const filesScannedCard = screen.getByText('Files Scanned').closest('div');
    fireEvent.click(filesScannedCard as Element);

    expect(mockOnFilesClick).toHaveBeenCalled();
  });

  it('should handle issues with unknown severity values by excluding them from the counts', () => {
    const mockScanResults = createMockScanResults({
      issues: [
        { severity: 'error', message: 'Critical issue' } as ScanIssue,
        { severity: 'warning', message: 'Warning issue' } as ScanIssue,
        { severity: 'info', message: 'Info issue' } as ScanIssue,
      ],
      scannedFiles: 10,
    });

    renderScanStatistics(mockScanResults, null, mockOnSeverityClick, mockOnFilesClick);

    const criticalCard = screen.getByText('Critical').closest('div');
    expect(criticalCard).toHaveTextContent('1');

    const warningsCard = screen.getByText('Warnings').closest('div');
    expect(warningsCard).toHaveTextContent('1');

    const informationCard = screen.getByText('Information').closest('div');
    expect(informationCard).toHaveTextContent('1');

    const filesScannedCard = screen.getByText('Files Scanned').closest('div');
    expect(filesScannedCard).toHaveTextContent('10');
  });
});
