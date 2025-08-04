import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ScanPath } from '../ModelAudit.types';
import ConfigurationTab from './ConfigurationTab';

vi.mock('./PathSelector', () => ({
  default: ({ paths }: { paths: ScanPath[] }) => (
    <div data-testid="path-selector">
      <span>Paths: {paths.length}</span>
    </div>
  ),
}));

const theme = createTheme();

describe('ConfigurationTab', () => {
  const defaultProps = {
    paths: [],
    onAddPath: vi.fn(),
    onRemovePath: vi.fn(),
    onShowOptions: vi.fn(),
    onScan: vi.fn(),
    isScanning: false,
    error: null,
    onClearError: vi.fn(),
    currentWorkingDir: '/fake/dir',
    installationStatus: {
      checking: false,
      installed: true,
    },
  };

  it('should call onScan with the current description value when the scan button is clicked and the form is valid', () => {
    const onScanMock = vi.fn();
    const testDescription = 'My test scan description';
    const props = {
      ...defaultProps,
      onScan: onScanMock,
      paths: [{ path: '/fake/model.pkl', type: 'file' as const, name: 'model.pkl' }],
    };

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );

    const descriptionInput = screen.getByLabelText(/Scan Description/i);
    fireEvent.change(descriptionInput, { target: { value: testDescription } });

    const scanButton = screen.getByRole('button', { name: /Start Security Scan/i });
    fireEvent.click(scanButton);

    expect(onScanMock).toHaveBeenCalledTimes(1);
    expect(onScanMock).toHaveBeenCalledWith(testDescription);
  });

  it('should disable the scan button if isScanning is true', () => {
    const props = { ...defaultProps, isScanning: true };
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );
    const scanButton = screen.getByRole('button', { name: /Scanning\.\.\./i });
    expect(scanButton).toBeDisabled();
  });

  it('should disable the scan button if paths is empty', () => {
    const props = { ...defaultProps, paths: [] };
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );
    const scanButton = screen.getByRole('button', { name: /Start Security Scan/i });
    expect(scanButton).toBeDisabled();
  });

  it('should disable the scan button if installationStatus.checking is true', () => {
    const props = {
      ...defaultProps,
      installationStatus: { ...defaultProps.installationStatus, checking: true },
    };
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );
    const scanButton = screen.getByRole('button', { name: /Checking Installation\.\.\./i });
    expect(scanButton).toBeDisabled();
  });

  it('should display the correct scan button text based on props', () => {
    const testCases = [
      {
        props: { ...defaultProps, isScanning: true },
        expectedText: 'Scanning...',
      },
      {
        props: {
          ...defaultProps,
          installationStatus: { ...defaultProps.installationStatus, checking: true },
        },
        expectedText: 'Checking Installation...',
      },
      {
        props: {
          ...defaultProps,
          installationStatus: { ...defaultProps.installationStatus, installed: false },
        },
        expectedText: 'ModelAudit Not Installed',
      },
      {
        props: {
          ...defaultProps,
          installationStatus: { ...defaultProps.installationStatus, installed: null },
        },
        expectedText: 'Start Security Scan (Checking...)',
      },
      {
        props: { ...defaultProps },
        expectedText: 'Start Security Scan',
      },
    ];

    testCases.forEach(({ props, expectedText }) => {
      render(
        <ThemeProvider theme={theme}>
          <ConfigurationTab {...props} />
        </ThemeProvider>,
      );
      const scanButton = screen.getByRole('button', { name: expectedText });
      expect(scanButton).toBeInTheDocument();
    });
  });

  it('should display an error alert with the error message when error is set, and call onClearError when the alert is closed', () => {
    const onClearErrorMock = vi.fn();
    const testErrorMessage = 'This is a test error message';
    const props = {
      ...defaultProps,
      error: testErrorMessage,
      onClearError: onClearErrorMock,
    };

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(testErrorMessage);

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(onClearErrorMock).toHaveBeenCalledTimes(1);
  });

  it('should render a description text field and update its value as the user types', () => {
    const props = { ...defaultProps };
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );

    const descriptionInput = screen.getByLabelText(/Scan Description/i);
    fireEvent.change(descriptionInput, { target: { value: 'Test description' } });

    expect((descriptionInput as HTMLInputElement).value).toBe('Test description');
  });

  it('should call onScan with an empty string when the description field is empty', () => {
    const onScanMock = vi.fn();
    const props = {
      ...defaultProps,
      onScan: onScanMock,
      paths: [{ path: '/fake/model.pkl', type: 'file' as const, name: 'model.pkl' }],
    };

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );

    const scanButton = screen.getByRole('button', { name: /Start Security Scan/i });
    fireEvent.click(scanButton);

    expect(onScanMock).toHaveBeenCalledTimes(1);
    expect(onScanMock).toHaveBeenCalledWith('');
  });

  it('should call onScan with the description containing special characters and HTML tags', () => {
    const onScanMock = vi.fn();
    const testDescription =
      'Test with special chars: <>&"\' and HTML tags: <div><span></span></div>';
    const props = {
      ...defaultProps,
      onScan: onScanMock,
      paths: [{ path: '/fake/model.pkl', type: 'file' as const, name: 'model.pkl' }],
    };

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );

    const descriptionInput = screen.getByLabelText(/Scan Description/i);
    fireEvent.change(descriptionInput, { target: { value: testDescription } });

    const scanButton = screen.getByRole('button', { name: /Start Security Scan/i });
    fireEvent.click(scanButton);

    expect(onScanMock).toHaveBeenCalledTimes(1);
    expect(onScanMock).toHaveBeenCalledWith(testDescription);
  });

  it('should retain the description value when an error occurs during scanning', async () => {
    const onScanMock = vi.fn(() => Promise.reject(new Error('Simulated error')));
    const testDescription = 'My test scan description';
    const props = {
      ...defaultProps,
      onScan: onScanMock,
      paths: [{ path: '/fake/model.pkl', type: 'file' as const, name: 'model.pkl' }],
    };

    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...props} />
      </ThemeProvider>,
    );

    const descriptionInput = screen.getByLabelText(/Scan Description/i);
    fireEvent.change(descriptionInput, { target: { value: testDescription } });

    const scanButton = screen.getByRole('button', { name: /Start Security Scan/i });
    fireEvent.click(scanButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(descriptionInput).toHaveValue(testDescription);
  });
});
