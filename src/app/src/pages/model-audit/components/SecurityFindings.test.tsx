import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SecurityFindings from './SecurityFindings';

import type { ScanResult } from '../ModelAudit.types';

describe('SecurityFindings', () => {
  const mockOnSeverityChange = vi.fn();
  const mockOnToggleRawOutput = vi.fn();

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
});
