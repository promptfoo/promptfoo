import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, createTheme } from '@mui/material/styles';

import HistoryTab from './HistoryTab';
import { useModelAuditStore } from '../store';

vi.mock('../store');

const theme = createTheme();

const mockUseModelAuditStore = vi.mocked(useModelAuditStore);

const mockHistoricalScans = [
  {
    id: 'scan-1-abcdef-123456',
    createdAt: new Date('2024-01-01T12:00:00Z').getTime(),
    name: 'Scan with multiple issues',
    modelPath: '/path/to/model1.gguf',
    hasErrors: true,
    results: {
      issues: [
        { severity: 'error', message: 'e1', location: 'l1', details: {} },
        { severity: 'warning', message: 'w1', location: 'l1', details: {} },
        { severity: 'warning', message: 'w2', location: 'l2', details: {} },
      ],
      scannedFiles: 1,
      totalFiles: 1,
      duration: 1,
      success: false,
      scannedFilesList: [],
    },
    totalChecks: 20,
    passedChecks: 17,
  },
  {
    id: 'scan-2-ghijkl-789012',
    createdAt: new Date('2024-01-02T14:30:00Z').getTime(),
    name: null,
    modelPath: '/path/to/model2.safetensors',
    hasErrors: false,
    results: {
      issues: [],
      scannedFiles: 1,
      totalFiles: 1,
      duration: 1,
      success: true,
      scannedFilesList: [],
    },
    totalChecks: 15,
    passedChecks: 15,
  },
];

describe('HistoryTab', () => {
  const mockFetchHistoricalScans = vi.fn();
  const mockDeleteHistoricalScan = vi.fn();
  const mockViewHistoricalScan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseModelAuditStore.mockReturnValue({
      historicalScans: mockHistoricalScans,
      isLoadingHistory: false,
      historyError: null,
      fetchHistoricalScans: mockFetchHistoricalScans,
      deleteHistoricalScan: mockDeleteHistoricalScan,
      viewHistoricalScan: mockViewHistoricalScan,
      recentScans: [],
      paths: [],
      scanOptions: {},
      isScanning: false,
      scanResults: null,
      error: null,
      installationStatus: { checking: false, installed: true, error: null, cwd: null },
      activeTab: 2,
      showFilesDialog: false,
      showOptionsDialog: false,
    } as any);
  });

  it('should fetch and display a table of historical scans when there are scans available', () => {
    render(
      <ThemeProvider theme={theme}>
        <HistoryTab />
      </ThemeProvider>,
    );

    expect(mockFetchHistoricalScans).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Scan History')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'ID' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Created At' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Model Path' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Issues Found' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Checks' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();

    const tableBody = table.querySelector('tbody');
    expect(tableBody).not.toBeNull();
    const rows = within(tableBody!).getAllByRole('row');
    expect(rows).toHaveLength(mockHistoricalScans.length);

    const row1 = rows[0];
    expect(within(row1).getByText(mockHistoricalScans[0].id)).toBeInTheDocument();
    expect(
      within(row1).getByText(new Date(mockHistoricalScans[0].createdAt).toLocaleString()),
    ).toBeInTheDocument();
    expect(within(row1).getByText('Scan with multiple issues')).toBeInTheDocument();
    expect(within(row1).getByText('/path/to/model1.gguf')).toBeInTheDocument();
    expect(within(row1).getByText('Issues Found')).toBeInTheDocument();
    expect(within(row1).getByText('1 Error')).toBeInTheDocument();
    expect(within(row1).getByText('2 Warnings')).toBeInTheDocument();
    const checksCell1 = within(row1).getAllByRole('cell')[6];
    expect(within(checksCell1).getByText('17')).toBeInTheDocument();
    expect(within(checksCell1).getByText('/')).toBeInTheDocument();
    expect(within(checksCell1).getByText('20')).toBeInTheDocument();
    expect(within(row1).getByRole('button', { name: 'View Results' })).toBeInTheDocument();
    expect(within(row1).getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    const row2 = rows[1];
    expect(within(row2).getByText(mockHistoricalScans[1].id)).toBeInTheDocument();
    expect(
      within(row2).getByText(new Date(mockHistoricalScans[1].createdAt).toLocaleString()),
    ).toBeInTheDocument();
    expect(within(row2).getByText('Unnamed scan')).toBeInTheDocument();
    expect(within(row2).getByText('/path/to/model2.safetensors')).toBeInTheDocument();
    expect(within(row2).getByText('Clean')).toBeInTheDocument();
    expect(within(row2).getByText('No Issues')).toBeInTheDocument();
    const checksCell2 = within(row2).getAllByRole('cell')[6];
    const checkNumbers = within(checksCell2).getAllByText('15');
    expect(checkNumbers).toHaveLength(2);
    expect(within(checksCell2).getByText('/')).toBeInTheDocument();
    expect(within(row2).getByRole('button', { name: 'View Results' })).toBeInTheDocument();
    expect(within(row2).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
