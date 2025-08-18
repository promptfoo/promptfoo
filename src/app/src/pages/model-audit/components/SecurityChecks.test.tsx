import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SecurityChecks from './SecurityChecks';

import type { ScanResult } from '../ModelAudit.types';

describe('SecurityChecks', () => {
  const mockScanResultsWithChecks: ScanResult = {
    path: 'mock/path',
    success: true,
    issues: [],
    checks: [
      {
        name: 'Check for dangerous imports',
        status: 'passed',
        message: 'No dangerous imports found',
        location: '/path/to/safe/file.py',
        timestamp: Date.now() / 1000,
      },
      {
        name: 'Check for hardcoded secrets',
        status: 'failed',
        message: 'Found potential hardcoded secret',
        location: '/path/to/risky/file.py',
        severity: 'error',
        details: {
          line: 42,
          context: 'api_key = "secret123"',
        },
        why: 'Hardcoded secrets can be exposed in version control',
        timestamp: Date.now() / 1000,
      },
      {
        name: 'Check for unsafe deserialization',
        status: 'passed',
        message: 'No unsafe deserialization found',
        location: '/path/to/model.pkl',
        timestamp: Date.now() / 1000,
      },
      {
        name: 'Check for backdoor patterns',
        status: 'failed',
        message: 'Suspicious pattern detected',
        location: '/path/to/model.py',
        severity: 'warning',
        why: 'Pattern matches known backdoor techniques',
        timestamp: Date.now() / 1000,
      },
    ],
  };

  const mockScanResultsWithoutChecks: ScanResult = {
    path: 'mock/path',
    success: true,
    issues: [],
  };

  describe('when checks are present', () => {
    it('should render passed and failed checks sections', () => {
      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={mockScanResultsWithChecks} />
        </ThemeProvider>,
      );

      expect(screen.getByText('Failed Checks')).toBeInTheDocument();
      expect(screen.getByText('Passed Checks')).toBeInTheDocument();
      expect(screen.getByText('2 passed')).toBeInTheDocument();
      expect(screen.getByText('2 failed')).toBeInTheDocument();
    });

    it('should display check names in accordions', () => {
      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={mockScanResultsWithChecks} />
        </ThemeProvider>,
      );

      expect(screen.getByText('Check for dangerous imports')).toBeInTheDocument();
      expect(screen.getByText('Check for hardcoded secrets')).toBeInTheDocument();
      expect(screen.getByText('Check for unsafe deserialization')).toBeInTheDocument();
      expect(screen.getByText('Check for backdoor patterns')).toBeInTheDocument();
    });

    it('should show check details when accordion is expanded', () => {
      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={mockScanResultsWithChecks} />
        </ThemeProvider>,
      );

      // Click on a failed check to expand it
      const failedCheckAccordion = screen.getByText('Check for hardcoded secrets');
      fireEvent.click(failedCheckAccordion);

      // Check if details are shown
      expect(screen.getByText('Found potential hardcoded secret')).toBeInTheDocument();
      expect(screen.getByText('/path/to/risky/file.py')).toBeInTheDocument();
      expect(
        screen.getByText('Hardcoded secrets can be exposed in version control'),
      ).toBeInTheDocument();
    });

    it('should display severity badges for failed checks', () => {
      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={mockScanResultsWithChecks} />
        </ThemeProvider>,
      );

      // Expand failed checks section
      const failedCheckAccordion = screen.getByText('Check for hardcoded secrets');
      fireEvent.click(failedCheckAccordion);

      // Check for severity badge
      expect(screen.getByText('error')).toBeInTheDocument();
    });

    it('should display check details in formatted JSON', () => {
      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={mockScanResultsWithChecks} />
        </ThemeProvider>,
      );

      // Expand a check with details
      const failedCheckAccordion = screen.getByText('Check for hardcoded secrets');
      fireEvent.click(failedCheckAccordion);

      // Check for formatted details - look for the actual JSON content
      expect(
        screen.getByText((content, element) => {
          // Check if this is a pre element containing our JSON
          return (
            element?.tagName === 'PRE' &&
            content.includes('"line": 42') &&
            content.includes('"context": "api_key = \\"secret123\\""')
          );
        }),
      ).toBeInTheDocument();
    });
  });

  describe('when no checks are present', () => {
    it('should display message when no checks are available', () => {
      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={mockScanResultsWithoutChecks} />
        </ThemeProvider>,
      );

      expect(screen.getByText('No security checks available')).toBeInTheDocument();
    });
  });

  describe('when in dark mode', () => {
    const darkTheme = createTheme({
      palette: {
        mode: 'dark',
      },
    });

    it('should render with appropriate dark mode styles', () => {
      render(
        <ThemeProvider theme={darkTheme}>
          <SecurityChecks scanResults={mockScanResultsWithChecks} />
        </ThemeProvider>,
      );

      // Expand a check with details
      const failedCheckAccordion = screen.getByText('Check for hardcoded secrets');
      fireEvent.click(failedCheckAccordion);

      // Check that details are rendered in a pre element (dark mode styling)
      expect(
        screen.getByText((content, element) => {
          return element?.tagName === 'PRE' && content.includes('"line": 42');
        }),
      ).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle checks without location', () => {
      const scanResultsNoLocation: ScanResult = {
        path: 'mock/path',
        success: true,
        issues: [],
        checks: [
          {
            name: 'Global check',
            status: 'passed',
            message: 'All files passed',
            timestamp: Date.now() / 1000,
          },
        ],
      };

      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={scanResultsNoLocation} />
        </ThemeProvider>,
      );

      const checkAccordion = screen.getByText('Global check');
      fireEvent.click(checkAccordion);

      // Should not show location since it's not provided
      expect(screen.queryByText('Location:')).not.toBeInTheDocument();
    });

    it('should handle checks without why field', () => {
      const scanResultsNoWhy: ScanResult = {
        path: 'mock/path',
        success: true,
        issues: [],
        checks: [
          {
            name: 'Simple check',
            status: 'failed',
            message: 'Check failed',
            location: '/path/to/file',
            timestamp: Date.now() / 1000,
          },
        ],
      };

      render(
        <ThemeProvider theme={createTheme()}>
          <SecurityChecks scanResults={scanResultsNoWhy} />
        </ThemeProvider>,
      );

      const checkAccordion = screen.getByText('Simple check');
      fireEvent.click(checkAccordion);

      // Should not show why section since it's not provided
      expect(screen.queryByText('Why this matters:')).not.toBeInTheDocument();
    });
  });
});
