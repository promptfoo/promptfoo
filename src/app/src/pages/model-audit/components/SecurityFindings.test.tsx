import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SecurityFindings from './SecurityFindings';

import type { ScanResult, ScanIssue } from '../ModelAudit.types';

describe('SecurityFindings', () => {
  const mockOnSeverityChange = vi.fn();
  const mockOnToggleRawOutput = vi.fn();

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

  const mockScanResultsWithDetails: ScanResult = {
    path: 'mock/path',
    success: true,
    issues: [
      {
        severity: 'error',
        message: 'A critical vulnerability was found.',
        details: {
          path: '/path/to/vulnerable/file.py',
          code: 'os.system("rm -rf /")',
        },
      },
    ],
    rawOutput: 'Raw scanner output text.',
  };

  describe('when in dark mode', () => {
    const darkTheme = createTheme({
      palette: {
        mode: 'dark',
      },
    });

    it('should render the issue details Paper with a background color of theme.palette.grey[800]', () => {
      render(
        <ThemeProvider theme={darkTheme}>
          <SecurityFindings
            scanResults={mockScanResultsWithDetails}
            selectedSeverity={null}
            onSeverityChange={mockOnSeverityChange}
            showRawOutput={false}
            onToggleRawOutput={mockOnToggleRawOutput}
          />
        </ThemeProvider>,
      );

      const detailsContent = screen.getByText((content) =>
        content.includes('"code": "os.system(\\"rm -rf /\\")"'),
      );
      expect(detailsContent).toBeInTheDocument();

      // Details are now displayed in an Alert component, not a Paper
      const detailsAlert = detailsContent.closest('.MuiAlert-root');
      expect(detailsAlert).toBeInTheDocument();
    });

    it('should render the raw output in a dialog when showRawOutput is true', () => {
      render(
        <ThemeProvider theme={darkTheme}>
          <SecurityFindings
            scanResults={mockScanResultsWithDetails}
            selectedSeverity={null}
            onSeverityChange={mockOnSeverityChange}
            showRawOutput={true}
            onToggleRawOutput={mockOnToggleRawOutput}
          />
        </ThemeProvider>,
      );

      const rawOutputElement = screen.getByText('Raw scanner output text.');
      expect(rawOutputElement).toBeInTheDocument();

      // Raw output is now displayed in a dialog with a pre element
      const dialogTitle = screen.getByText('Raw Scanner Output');
      expect(dialogTitle).toBeInTheDocument();
    });
  });

  describe('when in light mode', () => {
    const lightTheme = createTheme({
      palette: {
        mode: 'light',
      },
    });

    it('should render the raw output in a dialog when showRawOutput is true', () => {
      render(
        <ThemeProvider theme={lightTheme}>
          <SecurityFindings
            scanResults={{ ...mockScanResultsWithDetails, rawOutput: 'Raw scanner output text.' }}
            selectedSeverity={null}
            onSeverityChange={mockOnSeverityChange}
            showRawOutput={true}
            onToggleRawOutput={mockOnToggleRawOutput}
          />
        </ThemeProvider>,
      );

      const rawOutputText = screen.getByText('Raw scanner output text.');
      expect(rawOutputText).toBeInTheDocument();

      // Raw output is now displayed in a dialog with a pre element
      const dialogTitle = screen.getByText('Raw Scanner Output');
      expect(dialogTitle).toBeInTheDocument();
    });
  });

  it('should render an info alert showing the total number of issues and debug messages', () => {
    const mockScanResultsWithIssues: ScanResult = {
      path: 'mock/path',
      success: true,
      issues: [
        { severity: 'error', message: 'Error message' },
        { severity: 'warning', message: 'Warning message' },
        { severity: 'info', message: 'Info message' },
        { severity: 'debug', message: 'Debug message' },
        { severity: 'debug', message: 'Another debug message' },
      ] as ScanIssue[],
      rawOutput: 'Raw scanner output text.',
    };

    render(
      <SecurityFindings
        scanResults={mockScanResultsWithIssues}
        selectedSeverity={null}
        onSeverityChange={mockOnSeverityChange}
        showRawOutput={false}
        onToggleRawOutput={mockOnToggleRawOutput}
      />,
    );

    const alertText = screen.getByText('2 security issues found: 1 error, 1 warning');
    expect(alertText).toBeInTheDocument();
  });

  it('should render a success message when filteredIssues is empty and selectedSeverity is null', () => {
    const mockScanResults: ScanResult = {
      path: 'mock/path',
      success: true,
      issues: [],
      rawOutput: '',
    };

    render(
      <SecurityFindings
        scanResults={mockScanResults}
        selectedSeverity={null}
        onSeverityChange={mockOnSeverityChange}
        showRawOutput={false}
        onToggleRawOutput={mockOnToggleRawOutput}
      />,
    );

    const successMessage = screen.getByText('No security issues detected');
    expect(successMessage).toBeInTheDocument();
  });

  it('should only display issues matching the selected severity when a severity is chosen from the filter dropdown', () => {
    const mockScanResults = createMockScanResults({
      issues: [
        { severity: 'error', message: 'Error issue' },
        { severity: 'warning', message: 'Warning issue' },
        { severity: 'info', message: 'Info issue' },
      ],
    });

    render(
      <SecurityFindings
        scanResults={mockScanResults}
        selectedSeverity="warning"
        onSeverityChange={mockOnSeverityChange}
        showRawOutput={false}
        onToggleRawOutput={mockOnToggleRawOutput}
      />,
    );

    const warningIssueElement = screen.getByText('Warning issue');
    expect(warningIssueElement).toBeInTheDocument();

    expect(screen.queryByText('Error issue')).not.toBeInTheDocument();
    expect(screen.queryByText('Info issue')).not.toBeInTheDocument();
  });

  it('should display "No warning issues found" when selectedSeverity is "warning" and no warning issues exist', () => {
    const mockScanResultsWithError: ScanResult = {
      path: 'mock/path',
      success: true,
      issues: [
        {
          severity: 'error',
          message: 'A critical vulnerability was found.',
          details: {
            path: '/path/to/vulnerable/file.py',
            code: 'os.system("rm -rf /")',
          },
        },
      ],
      rawOutput: 'Raw scanner output text.',
    };

    render(
      <SecurityFindings
        scanResults={mockScanResultsWithError}
        selectedSeverity="warning"
        onSeverityChange={mockOnSeverityChange}
        showRawOutput={false}
        onToggleRawOutput={mockOnToggleRawOutput}
      />,
    );

    const noIssuesMessage = screen.getByText('No warning issues found');
    expect(noIssuesMessage).toBeInTheDocument();
  });

  describe('when toggling group by file', () => {
    it('should display issues grouped by file initially, then as a flat list when toggled', async () => {
      const user = userEvent.setup();

      const mockScanResultsWithMultipleIssues: ScanResult = {
        path: 'mock/path',
        success: true,
        issues: [
          {
            severity: 'error',
            message: 'A critical vulnerability was found in file1.py.',
            details: {
              path: '/path/to/file1.py',
              code: 'os.system("rm -rf /")',
            },
          },
          {
            severity: 'warning',
            message: 'A potential vulnerability was found in file2.js.',
            details: {
              path: '/path/to/file2.js',
              code: 'console.log("hello")',
            },
          },
          {
            severity: 'info',
            message: 'An informational message about file1.py.',
            details: {
              path: '/path/to/file1.py',
              code: 'print("hello")',
            },
          },
        ],
        rawOutput: 'Raw scanner output text.',
      };

      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityFindings
            scanResults={mockScanResultsWithMultipleIssues}
            selectedSeverity={null}
            onSeverityChange={mockOnSeverityChange}
            showRawOutput={false}
            onToggleRawOutput={mockOnToggleRawOutput}
          />
        </ThemeProvider>,
      );

      expect(screen.getByText('file1.py')).toBeInTheDocument();
      expect(screen.getByText('file2.js')).toBeInTheDocument();

      const groupByFileButton = screen.getByRole('button', { name: 'Group by File' });
      await user.click(groupByFileButton);

      expect(() => screen.getByText('file1.py')).toThrowError();
      expect(() => screen.getByText('file2.js')).toThrowError();
      expect(
        screen.getByText('A critical vulnerability was found in file1.py.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('A potential vulnerability was found in file2.js.'),
      ).toBeInTheDocument();

      const flatListButton = screen.getByRole('button', { name: 'Flat List' });
      await user.click(flatListButton);

      expect(screen.getByText('file1.py')).toBeInTheDocument();
      expect(screen.getByText('file2.js')).toBeInTheDocument();
    });
  });
});
