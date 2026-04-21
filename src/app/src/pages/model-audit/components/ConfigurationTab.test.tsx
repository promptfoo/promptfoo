import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfigurationTab from './ConfigurationTab';

vi.mock('./PathSelector', () => ({
  default: () => <div data-testid="path-selector" />,
}));

vi.mock('./InstallationGuide', () => ({
  default: () => <div data-testid="installation-guide" />,
}));

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
      <TooltipProvider delayDuration={0}>
        <ConfigurationTab {...defaultProps} error={initialError} />
      </TooltipProvider>,
    );

    expect(screen.getByText(initialError)).toBeInTheDocument();

    await act(() => {
      rerender(
        <TooltipProvider delayDuration={0}>
          <ConfigurationTab {...defaultProps} error={null} />
        </TooltipProvider>,
      );
    });

    expect(screen.queryByText(initialError)).toBeNull();
  });

  it('should show error state but remain clickable when installationStatus.installed is false', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <ConfigurationTab
          {...defaultProps}
          installationStatus={{ checking: false, installed: false }}
          paths={[{ path: '/test/path', type: 'file', name: 'test.pkl' }]}
        />
      </TooltipProvider>,
    );

    // Button should show "ModelAudit Not Installed" text
    const scanButton = screen.getByRole('button', { name: 'ModelAudit Not Installed' });
    // Button should NOT be disabled - users can click it to see installation instructions
    expect(scanButton).not.toBeDisabled();
    // Button should have error color styling (destructive variant)
    expect(scanButton).toHaveClass('bg-destructive');
  });

  it('should render PathSelector', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <ConfigurationTab {...defaultProps} />
      </TooltipProvider>,
    );

    expect(screen.getByTestId('path-selector')).toBeInTheDocument();
  });
});
