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

      const detailsPaper = detailsContent.closest('.MuiPaper-root');
      expect(detailsPaper).toBeInTheDocument();

      expect(detailsPaper).toHaveStyle({ backgroundColor: 'rgb(66, 66, 66)' });
    });

    it('should render the raw output Paper with background color theme.palette.grey[900] and text color theme.palette.grey[100] when showRawOutput is true', () => {
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

      const rawOutputPaper = rawOutputElement.closest('.MuiPaper-root');
      expect(rawOutputPaper).toBeInTheDocument();

      expect(rawOutputPaper).toHaveStyle({
        backgroundColor: 'rgb(33, 33, 33)',
        color: 'rgb(245, 245, 245)',
      });
    });
  });

  describe('when in light mode', () => {
    const lightTheme = createTheme({
      palette: {
        mode: 'light',
      },
    });

    it('should render the raw output Paper with background color theme.palette.grey[50] and text color theme.palette.grey[900] when showRawOutput is true', () => {
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
      const rawOutputPaper = rawOutputText.closest('.MuiPaper-root');

      expect(rawOutputPaper).toBeInTheDocument();
      expect(rawOutputPaper).toHaveStyle({ backgroundColor: lightTheme.palette.grey[50] });
      expect(rawOutputText).toHaveStyle({ color: lightTheme.palette.grey[900] });
    });
  });
});
