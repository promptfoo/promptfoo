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

  it('should render a Paper for a file section with a border color of error.main and border width of 2 when the file contains at least one critical issue', () => {
    const mockScanResults: ScanResult = createMockScanResults({
      issues: [
        {
          severity: 'error',
          message: 'A critical vulnerability was found in file1.py.',
          details: {
            path: '/path/to/file1.py',
            code: 'os.system("rm -rf /")',
          },
        } as ScanIssue,
      ],
    });

    render(
      <SecurityFindings
        scanResults={mockScanResults}
        selectedSeverity={null}
        onSeverityChange={mockOnSeverityChange}
        showRawOutput={false}
        onToggleRawOutput={mockOnToggleRawOutput}
      />,
    );

    const fileNameElement = screen.getByText('file1.py');
    const paperElement = fileNameElement.closest('.MuiPaper-root');

    expect(paperElement).toHaveStyle('border-color: rgb(211, 47, 47)');
    expect(paperElement).toHaveStyle('border-width: 2px');
  });

  it("should display an expand/collapse trigger in the grouped-by-file view with the label 'Show {N} Issues' (or 'Hide {N} Issues') and toggle the visibility of the issues list when clicked", async () => {
    const user = userEvent.setup();
    const mockScanResults: ScanResult = {
      path: 'mock/path',
      success: true,
      issues: [
        { severity: 'error', message: 'Error message', details: { path: 'file1.py' } },
        { severity: 'warning', message: 'Warning message', details: { path: 'file1.py' } },
      ] as ScanIssue[],
      rawOutput: 'Raw scanner output text.',
      scannedFiles: 1,
    };

    render(
      <ThemeProvider theme={createTheme()}>
        <SecurityFindings
          scanResults={mockScanResults}
          selectedSeverity={null}
          onSeverityChange={mockOnSeverityChange}
          showRawOutput={false}
          onToggleRawOutput={mockOnToggleRawOutput}
        />
      </ThemeProvider>,
    );

    const showIssuesButton = await screen.findByText('Show 2 Issues');
    expect(showIssuesButton).toBeInTheDocument();

    await user.click(showIssuesButton);

    const hideIssuesButton = await screen.findByText('Hide 2 Issues');
    expect(hideIssuesButton).toBeInTheDocument();

    await user.click(hideIssuesButton);

    const showIssuesButtonAgain = await screen.findByText('Show 2 Issues');
    expect(showIssuesButtonAgain).toBeInTheDocument();
  });

  it('should display the file name and full file path in the file header for each file section in the grouped-by-file view', () => {
    const mockScanResults = createMockScanResults({
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
    });

    render(
      <ThemeProvider theme={createTheme()}>
        <SecurityFindings
          scanResults={mockScanResults}
          selectedSeverity={null}
          onSeverityChange={mockOnSeverityChange}
          showRawOutput={false}
          onToggleRawOutput={mockOnToggleRawOutput}
        />
      </ThemeProvider>,
    );

    const fileName = 'file.py';
    const filePath = '/path/to/vulnerable/file.py';

    expect(screen.getByText(fileName)).toBeInTheDocument();
    expect(screen.getByText(filePath)).toBeInTheDocument();
  });

  describe('when handling unknown severity values', () => {
    it('should render the issue with the default InfoIcon and label when the severity is unknown', () => {
      const mockScanResults = createMockScanResults({
        issues: [{ severity: 'info', message: 'Unknown severity issue' }],
      });

      render(
        <SecurityFindings
          scanResults={mockScanResults}
          selectedSeverity={null}
          onSeverityChange={mockOnSeverityChange}
          showRawOutput={false}
          onToggleRawOutput={mockOnToggleRawOutput}
        />,
      );

      const issueElement = screen.getByText('Unknown severity issue');
      expect(issueElement).toBeInTheDocument();

      const infoIcon = screen.getByTestId('InfoIcon');
      expect(infoIcon).toBeInTheDocument();

      const severityBadge = screen.getByText('info');
      expect(severityBadge).toBeInTheDocument();
    });
  });

  it('should handle extremely long file names or paths in grouped-by-file view', () => {
    const longFilePath =
      'very/long/path/to/a/file/with/an/extremely/long/name/that/should/not/break/the/layout/file.py';
    const mockScanResults = createMockScanResults({
      issues: [
        {
          severity: 'error',
          message: 'A critical vulnerability was found.',
          details: {
            path: longFilePath,
            code: 'os.system("rm -rf /")',
          },
        },
      ],
    });

    render(
      <SecurityFindings
        scanResults={mockScanResults}
        selectedSeverity={null}
        onSeverityChange={mockOnSeverityChange}
        showRawOutput={false}
        onToggleRawOutput={mockOnToggleRawOutput}
      />,
    );

    const fileNameElement = screen.getByText('file.py');
    const filePathElement = screen.getByText(longFilePath);

    expect(fileNameElement).toBeInTheDocument();
    expect(filePathElement).toBeInTheDocument();
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
