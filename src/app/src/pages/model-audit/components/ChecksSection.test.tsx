import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import ChecksSection from './ChecksSection';
import type { ScanCheck } from '../ModelAudit.types';

vi.mock('@mui/x-data-grid', () => ({
  ...vi.importActual('@mui/x-data-grid'),
  DataGrid: (props: { rows: any[]; columns: any[] }) => {
    const { rows, columns } = props;
    return (
      <div data-testid="mock-data-grid">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.field}>{col.headerName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((col) => (
                  <td key={col.field}>{row[col.field]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
}));

const theme = createTheme();

describe('ChecksSection', () => {
  const mockChecks: ScanCheck[] = [
    {
      name: 'Insecure Deserialization',
      status: 'failed',
      message: 'Detected use of pickle, which can be unsafe.',
      severity: 'error',
      location: '/models/unsafe_model.pkl',
      why: 'Pickle can execute arbitrary code.',
      timestamp: new Date('2023-10-27T10:00:00Z').getTime(),
    },
    {
      name: 'File Permissions',
      status: 'passed',
      message: 'All file permissions are secure.',
      severity: 'info',
      location: '/models/safe_model.bin',
      why: 'Permissions are read-only.',
      timestamp: new Date('2023-10-27T10:00:01Z').getTime(),
    },
    {
      name: 'Outdated Dependency',
      status: 'skipped',
      message: 'Dependency is outdated and may contain vulnerabilities.',
      severity: 'warning',
      location: '/requirements.txt',
      why: 'Update dependency to the latest version.',
      timestamp: new Date('2023-10-27T10:00:02Z').getTime(),
    },
  ];

  it('should render accordion, summary, filter, and DataGrid on happy path', async () => {
    render(
      <ThemeProvider theme={theme}>
        <ChecksSection checks={mockChecks} totalChecks={10} passedChecks={8} failedChecks={2} />
      </ThemeProvider>,
    );

    const accordionHeader = screen.getByRole('button', { name: /Security Checks/i });
    expect(accordionHeader).toBeInTheDocument();

    expect(screen.getByText('Total: 10')).toBeInTheDocument();
    expect(screen.getByText('Passed: 8')).toBeInTheDocument();
    expect(screen.getByText('Failed: 2')).toBeInTheDocument();

    await userEvent.click(accordionHeader);

    expect(screen.getByText('Show Failed/Skipped Only')).toBeInTheDocument();

    expect(screen.getByTestId('mock-data-grid')).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Check Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Severity' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Message' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reason' })).toBeInTheDocument();

    expect(screen.getByText('Insecure Deserialization')).toBeInTheDocument();
    expect(screen.getByText('Detected use of pickle, which can be unsafe.')).toBeInTheDocument();
    expect(screen.getByText('/models/unsafe_model.pkl')).toBeInTheDocument();
    expect(screen.getByText('File Permissions')).toBeInTheDocument();
    expect(screen.getByText('All file permissions are secure.')).toBeInTheDocument();
    expect(screen.getByText('/models/safe_model.bin')).toBeInTheDocument();
  });

  it('should filter out passed checks when the filter chip is clicked and restore all checks when toggled back', async () => {
    render(
      <ThemeProvider theme={theme}>
        <ChecksSection checks={mockChecks} totalChecks={3} passedChecks={1} failedChecks={1} />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Security Checks/i }));

    expect(screen.getByText('Insecure Deserialization')).toBeInTheDocument();
    expect(screen.getByText('File Permissions')).toBeInTheDocument();
    expect(screen.getByText('Outdated Dependency')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Show Failed/Skipped Only'));

    expect(screen.getByText('Insecure Deserialization')).toBeInTheDocument();
    expect(screen.queryByText('File Permissions')).toBeNull();
    expect(screen.getByText('Outdated Dependency')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Show All Checks'));

    expect(screen.getByText('Insecure Deserialization')).toBeInTheDocument();
    expect(screen.getByText('File Permissions')).toBeInTheDocument();
    expect(screen.getByText('Outdated Dependency')).toBeInTheDocument();
  });

  it('should render nothing when totalChecks is defined and checks is an empty array', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ChecksSection checks={[]} totalChecks={10} />
      </ThemeProvider>,
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render the component without summary chips when totalChecks is undefined and checks is an empty array', () => {
    render(
      <ThemeProvider theme={theme}>
        <ChecksSection checks={[]} totalChecks={undefined} />
      </ThemeProvider>,
    );

    const accordionHeader = screen.getByRole('button', { name: /Security Checks/i });
    expect(accordionHeader).toBeInTheDocument();

    expect(screen.queryByText(/Total:/i)).toBeNull();
    expect(screen.queryByText(/Passed:/i)).toBeNull();
    expect(screen.queryByText(/Failed:/i)).toBeNull();
  });

  it('should handle special characters in check fields without breaking DataGrid', () => {
    const checksWithSpecialChars: ScanCheck[] = [
      {
        name: 'Check with "quotes" and \\backslashes\\',
        status: 'failed',
        message: 'Message with Unicode characters: こんにちは',
        severity: 'error',
        location: '/path/to/file_with_chars.txt',
        why: 'Reason with special chars',
        timestamp: new Date('2023-10-27T10:00:00Z').getTime(),
      },
    ];

    render(
      <ThemeProvider theme={theme}>
        <ChecksSection
          checks={checksWithSpecialChars}
          totalChecks={1}
          passedChecks={0}
          failedChecks={1}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('mock-data-grid')).toBeInTheDocument();

    expect(screen.getByText('Check with "quotes" and \\backslashes\\')).toBeInTheDocument();
    expect(screen.getByText('Message with Unicode characters: こんにちは')).toBeInTheDocument();
  });

  it('should handle edge cases in the location field gracefully', async () => {
    const edgeCaseChecks: ScanCheck[] = [
      {
        name: 'Single Segment Path',
        status: 'failed',
        message: 'Single segment path test',
        severity: 'error',
        location: 'filename.js',
        why: 'Testing single segment',
        timestamp: new Date('2024-01-01T00:00:00Z').getTime(),
      },
      {
        name: 'Relative Path',
        status: 'passed',
        message: 'Relative path test',
        severity: 'info',
        location: './relative/path.txt',
        why: 'Testing relative path',
        timestamp: new Date('2024-01-01T00:00:01Z').getTime(),
      },
      {
        name: 'Path with Special Chars',
        status: 'failed',
        message: 'Special chars path test',
        severity: 'warning',
        location: '/path/with/!@#$%^&*()_+=-`~[]\{}|;\':",./<>?chars.txt',
        why: 'Testing special chars',
        timestamp: new Date('2024-01-01T00:00:02Z').getTime(),
      },
    ];

    render(
      <ThemeProvider theme={theme}>
        <ChecksSection checks={edgeCaseChecks} totalChecks={3} passedChecks={1} failedChecks={2} />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Security Checks/i }));

    expect(screen.getByText('filename.js')).toBeInTheDocument();
    expect(screen.getByText('./relative/path.txt')).toBeInTheDocument();
    expect(
      screen.getByText('/path/with/!@#$%^&*()_+=-`~[]\{}|;\':",./<>?chars.txt'),
    ).toBeInTheDocument();
  });

  it('should not render Scanned Assets section when checks.length is 0, totalChecks is defined, and assets is an empty array', () => {
    render(
      <ThemeProvider theme={theme}>
        <ChecksSection checks={[]} totalChecks={1} assets={[]} />
      </ThemeProvider>,
    );

    const scannedAssetsHeader = screen.queryByText('Scanned Assets:');
    expect(scannedAssetsHeader).toBeNull();
  });
});
