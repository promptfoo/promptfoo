import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ConfigurationTab from './ConfigurationTab';

vi.mock('./PathSelector', () => ({
  default: () => <div data-testid="path-selector" />,
}));

vi.mock('./InstallationGuide', () => ({
  default: () => <div data-testid="installation-guide" />,
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

  it('should clear the error message when the error prop changes from non-null to null', async () => {
    const initialError = 'An error occurred';
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...defaultProps} error={initialError} />
      </ThemeProvider>,
    );

    expect(screen.getByText(initialError)).toBeInTheDocument();

    await act(() => {
      rerender(
        <ThemeProvider theme={theme}>
          <ConfigurationTab {...defaultProps} error={null} />
        </ThemeProvider>,
      );
    });

    expect(screen.queryByText(initialError)).toBeNull();
  });

  it('should disable the scan button when installationStatus.installed is false', () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab
          {...defaultProps}
          installationStatus={{ checking: false, installed: false }}
          paths={[{ path: '/test/path', type: 'file', name: 'test.pkl' }]}
        />
      </ThemeProvider>,
    );

    const scanButton = screen.getByRole('button', { name: 'ModelAudit Not Installed' });
    expect(scanButton).toBeDisabled();
  });

  it('should render PathSelector', () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfigurationTab {...defaultProps} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('path-selector')).toBeInTheDocument();
  });
});
