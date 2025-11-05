import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useConfirmDialog } from './useConfirmDialog';

// Test component that uses the hook
function TestComponent({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const handleClick = () => {
    confirm(
      {
        title: 'Test Confirmation',
        warningMessage: 'This is a warning',
        message: 'Are you sure?',
        itemName: 'Test Item',
        itemDetails: ['Detail 1', 'Detail 2', 'Detail 3'],
        actionButtonText: 'Confirm Action',
        actionButtonColor: 'error',
      },
      onConfirm,
    );
  };

  return (
    <>
      <button onClick={handleClick}>Open Dialog</button>
      <ConfirmDialog />
    </>
  );
}

describe('useConfirmDialog', () => {
  it('should not render dialog initially', () => {
    const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TestComponent onConfirm={mockOnConfirm} />);

    expect(screen.queryByText('Test Confirmation')).not.toBeInTheDocument();
  });

  it('should open dialog when confirm is called', async () => {
    const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TestComponent onConfirm={mockOnConfirm} />);

    const openButton = screen.getByText('Open Dialog');
    await userEvent.click(openButton);

    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
    });
  });

  it('should display all configuration properties', async () => {
    const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TestComponent onConfirm={mockOnConfirm} />);

    await userEvent.click(screen.getByText('Open Dialog'));

    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
      expect(screen.getByText('This is a warning')).toBeInTheDocument();
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByText('Test Item')).toBeInTheDocument();
      expect(screen.getByText('• Detail 1')).toBeInTheDocument();
      expect(screen.getByText('• Detail 2')).toBeInTheDocument();
      expect(screen.getByText('• Detail 3')).toBeInTheDocument();
    });
  });

  it('should show cancel and confirm buttons', async () => {
    const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TestComponent onConfirm={mockOnConfirm} />);

    await userEvent.click(screen.getByText('Open Dialog'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm Action' })).toBeInTheDocument();
    });
  });

  it('should close dialog when cancel is clicked', async () => {
    const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TestComponent onConfirm={mockOnConfirm} />);

    await userEvent.click(screen.getByText('Open Dialog'));

    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Test Confirmation')).not.toBeInTheDocument();
    });

    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it('should call onConfirm and close dialog when confirm is clicked', async () => {
    const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TestComponent onConfirm={mockOnConfirm} />);

    await userEvent.click(screen.getByText('Open Dialog'));

    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: 'Confirm Action' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByText('Test Confirmation')).not.toBeInTheDocument();
    });
  });

  it('should show loading state while confirming', async () => {
    let resolvePromise: () => void;
    const mockOnConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<TestComponent onConfirm={mockOnConfirm} />);

    await userEvent.click(screen.getByText('Open Dialog'));

    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: 'Confirm Action' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    // Buttons should be disabled during loading
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();

    // Resolve the promise
    resolvePromise!();

    await waitFor(() => {
      expect(screen.queryByText('Test Confirmation')).not.toBeInTheDocument();
    });
  });

  it('should not close dialog if confirmation fails', async () => {
    const mockOnConfirm = vi.fn().mockRejectedValue(new Error('Confirmation failed'));

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TestComponent onConfirm={mockOnConfirm} />);

    await userEvent.click(screen.getByText('Open Dialog'));

    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: 'Confirm Action' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    // Dialog should still be open
    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
    });

    // Should log error
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should prevent closing during confirmation', async () => {
    let resolvePromise: () => void;
    const mockOnConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<TestComponent onConfirm={mockOnConfirm} />);

    await userEvent.click(screen.getByText('Open Dialog'));

    await waitFor(() => {
      expect(screen.getByText('Test Confirmation')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: 'Confirm Action' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    // Try to click cancel while confirming
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toBeDisabled();

    // Resolve and verify it closes
    resolvePromise!();

    await waitFor(() => {
      expect(screen.queryByText('Test Confirmation')).not.toBeInTheDocument();
    });
  });

  it('should handle dialog with minimal config', async () => {
    function MinimalTestComponent() {
      const { confirm, ConfirmDialog } = useConfirmDialog();

      const handleClick = () => {
        confirm(
          {
            title: 'Simple Confirmation',
            itemName: 'Item',
          },
          async () => {},
        );
      };

      return (
        <>
          <button onClick={handleClick}>Open</button>
          <ConfirmDialog />
        </>
      );
    }

    render(<MinimalTestComponent />);

    await userEvent.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Simple Confirmation')).toBeInTheDocument();
      expect(screen.getByText('Item')).toBeInTheDocument();
      // Default button text
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });
  });

  it('should support custom icon', async () => {
    function CustomIconComponent() {
      const { confirm, ConfirmDialog } = useConfirmDialog();

      const handleClick = () => {
        confirm(
          {
            title: 'Custom Icon Test',
            itemName: 'Test',
            icon: <span data-testid="custom-icon">⚠️</span>,
          },
          async () => {},
        );
      };

      return (
        <>
          <button onClick={handleClick}>Open</button>
          <ConfirmDialog />
        </>
      );
    }

    render(<CustomIconComponent />);

    await userEvent.click(screen.getByText('Open'));

    await waitFor(() => {
      // Icon appears in both title and button, so use getAllByTestId
      const icons = screen.getAllByTestId('custom-icon');
      expect(icons.length).toBeGreaterThan(0);
    });
  });
});
