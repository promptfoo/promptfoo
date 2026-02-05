import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ScanStatistics from './ScanStatistics';

import type { ScanIssue, ScanResult } from '../ModelAudit.types';

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
  return render(
    <TooltipProvider delayDuration={0}>
      <ScanStatistics
        scanResults={scanResults}
        selectedSeverity={selectedSeverity}
        onSeverityClick={onSeverityClick}
        onFilesClick={onFilesClick}
      />
    </TooltipProvider>,
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

    const criticalCard = screen.getByText('Critical').closest('button');
    expect(criticalCard).toHaveTextContent('2');

    const warningsCard = screen.getByText('Warnings').closest('button');
    expect(warningsCard).toHaveTextContent('1');

    const informationCard = screen.getByText('Information').closest('button');
    expect(informationCard).toHaveTextContent('3');

    const filesScannedCard = screen.getByText('Files Scanned').closest('button');
    expect(filesScannedCard).toHaveTextContent('125');
  });

  it('should call onSeverityClick with the correct severity value when a severity StatCard is clicked', () => {
    const mockScanResults = createMockScanResults({
      issues: [{ severity: 'error', message: 'Critical issue' } as ScanIssue],
    });

    renderScanStatistics(mockScanResults, null, mockOnSeverityClick, mockOnFilesClick);

    const criticalCard = screen.getByText('Critical').closest('button');
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

    const warningsCard = screen.getByText('Warnings').closest('button');
    fireEvent.click(warningsCard as Element);

    expect(mockOnSeverityClick).toHaveBeenCalledWith(null);
  });

  it('should call onFilesClick when the Files Scanned StatCard is clicked', () => {
    const mockScanResults = createMockScanResults({
      scannedFiles: 125,
    });

    renderScanStatistics(mockScanResults, null, mockOnSeverityClick, mockOnFilesClick);

    const filesScannedCard = screen.getByText('Files Scanned').closest('button');
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

    const criticalCard = screen.getByText('Critical').closest('button');
    expect(criticalCard).toHaveTextContent('1');

    const warningsCard = screen.getByText('Warnings').closest('button');
    expect(warningsCard).toHaveTextContent('1');

    const informationCard = screen.getByText('Information').closest('button');
    expect(informationCard).toHaveTextContent('1');

    const filesScannedCard = screen.getByText('Files Scanned').closest('button');
    expect(filesScannedCard).toHaveTextContent('10');
  });
});
