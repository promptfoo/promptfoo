import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmEvalNameDialog } from './ConfirmEvalNameDialog';

describe('ConfirmEvalNameDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    title: 'Test Dialog',
    label: 'Name',
    currentName: 'Current Name',
    actionButtonText: 'Confirm',
    onConfirm: mockOnConfirm,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders dialog with correct title and label', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toBeInTheDocument();
    });

    it('renders with initial value from currentName', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name') as HTMLInputElement;
      expect(input.value).toBe('Current Name');
    });

    it('does not render when closed', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} open={false} />);
      expect(screen.queryByText('Test Dialog')).not.toBeInTheDocument();
    });

    it('shows action button with correct text', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('shows cancel button', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('shows custom helper text when provided', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} helperText="Custom helper text" />);
      expect(screen.getByText('Custom helper text')).toBeInTheDocument();
    });

    it('shows default helper text when not provided', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      expect(screen.getByText('Enter a name for this evaluation')).toBeInTheDocument();
    });
  });

  describe('Size Warnings', () => {
    it('does not show warning for small operations', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={5000}
          itemLabel="results"
        />,
      );
      expect(screen.queryByText(/This evaluation has/)).not.toBeInTheDocument();
    });

    it('shows info alert for large operations (>10K)', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={15000}
          itemLabel="results"
        />,
      );
      expect(screen.getByText(/This evaluation has 15,000 results/)).toBeInTheDocument();
      expect(screen.getByText(/This operation may take up to a minute/)).toBeInTheDocument();
    });

    it('shows warning alert for very large operations (>50K)', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={75000}
          itemLabel="results"
        />,
      );
      expect(screen.getByText(/This evaluation has 75,000 results/)).toBeInTheDocument();
      expect(
        screen.getByText(/This operation may take several minutes. Please be patient./),
      ).toBeInTheDocument();
    });

    it('uses custom itemLabel in warning', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={20000}
          itemLabel="test cases"
        />,
      );
      expect(screen.getByText(/This evaluation has 20,000 test cases/)).toBeInTheDocument();
    });

    it('does not show warning when showSizeWarning is false', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={false}
          itemCount={75000}
          itemLabel="results"
        />,
      );
      expect(screen.queryByText(/This evaluation has/)).not.toBeInTheDocument();
    });
  });

  describe('Input Validation', () => {
    it('disables confirm button for empty input', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: '' } });

      expect(confirmButton).toBeDisabled();
    });

    it('disables confirm button for whitespace-only input', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: '   ' } });

      expect(confirmButton).toBeDisabled();
    });

    it('enables confirm button for valid input', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });

      expect(confirmButton).toBeEnabled();
    });

    it('trims whitespace when confirming', async () => {
      mockOnConfirm.mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: '  Trimmed Name  ' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith('Trimmed Name');
      });
    });
  });

  describe('Rename Mode (no itemCount)', () => {
    it('disables confirm button when name has not changed', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} currentName="Current Name" />);
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeDisabled();
    });

    it('enables confirm button when name has changed', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} currentName="Current Name" />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });

      expect(confirmButton).toBeEnabled();
    });

    it('closes dialog without calling onConfirm when name unchanged', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} currentName="Current Name" />);
      const input = screen.getByLabelText('Name');

      fireEvent.change(input, { target: { value: 'Current Name' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnConfirm).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onConfirm when name has changed', async () => {
      mockOnConfirm.mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...defaultProps} currentName="Current Name" />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith('New Name');
      });
    });
  });

  describe('Copy Mode (with itemCount)', () => {
    const copyProps = {
      ...defaultProps,
      itemCount: 1000,
      itemLabel: 'results',
    };

    it('enables confirm button even with default name', () => {
      render(<ConfirmEvalNameDialog {...copyProps} />);
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeEnabled();
    });

    it('calls onConfirm even when name is same as currentName', async () => {
      mockOnConfirm.mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...copyProps} currentName="Test Name" />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'Test Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith('Test Name');
      });
    });

    it('always proceeds with copy operation regardless of name', async () => {
      mockOnConfirm.mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...copyProps} currentName="Original" />);
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith('Original');
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner when processing', async () => {
      const slowConfirm = vi.fn(() => new Promise(() => {}));
      render(<ConfirmEvalNameDialog {...defaultProps} onConfirm={slowConfirm} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });
    });

    it('disables inputs during loading', async () => {
      const slowConfirm = vi.fn(() => new Promise(() => {}));
      render(<ConfirmEvalNameDialog {...defaultProps} onConfirm={slowConfirm} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(input).toBeDisabled();
        expect(confirmButton).toBeDisabled();
        expect(cancelButton).toBeDisabled();
      });
    });

    it('shows processing message with item count', async () => {
      const slowConfirm = vi.fn(() => new Promise(() => {}));
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          onConfirm={slowConfirm}
          itemCount={5000}
          itemLabel="results"
        />,
      );
      const input = screen.getByLabelText('Name');

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(screen.getByText('Processing 5,000 results...')).toBeInTheDocument();
      });
    });

    it('closes dialog on successful confirmation', async () => {
      mockOnConfirm.mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message on failure', async () => {
      mockOnConfirm.mockRejectedValue(new Error('Operation failed'));
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('keeps dialog open on error', async () => {
      mockOnConfirm.mockRejectedValue(new Error('Operation failed'));
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('shows error in TextField error state', async () => {
      mockOnConfirm.mockRejectedValue(new Error('Network error'));
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('clears error on retry', async () => {
      mockOnConfirm.mockRejectedValueOnce(new Error('First error')).mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });

      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument();
      });
    });

    it('handles non-Error exceptions', async () => {
      mockOnConfirm.mockRejectedValue('String error');
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Interaction', () => {
    it('confirms on Enter key', async () => {
      mockOnConfirm.mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith('New Name');
      });
    });

    it('does not confirm on Shift+Enter', () => {
      mockOnConfirm.mockResolvedValue(undefined);
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name');

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Dialog Lifecycle', () => {
    it('resets state when dialog reopens', () => {
      const { rerender } = render(<ConfirmEvalNameDialog {...defaultProps} open={false} />);

      rerender(<ConfirmEvalNameDialog {...defaultProps} open={true} currentName="First Name" />);
      let input = screen.getByLabelText('Name') as HTMLInputElement;
      expect(input.value).toBe('First Name');

      fireEvent.change(input, { target: { value: 'Modified Name' } });
      expect(input.value).toBe('Modified Name');

      rerender(<ConfirmEvalNameDialog {...defaultProps} open={false} currentName="First Name" />);
      rerender(<ConfirmEvalNameDialog {...defaultProps} open={true} currentName="Second Name" />);

      input = screen.getByLabelText('Name') as HTMLInputElement;
      expect(input.value).toBe('Second Name');
    });

    it('clears error when dialog reopens', async () => {
      mockOnConfirm.mockRejectedValue(new Error('Test error'));
      const { rerender } = render(<ConfirmEvalNameDialog {...defaultProps} open={true} />);
      const input = screen.getByLabelText('Name');
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Test error')).toBeInTheDocument();
      });

      rerender(<ConfirmEvalNameDialog {...defaultProps} open={false} />);
      rerender(<ConfirmEvalNameDialog {...defaultProps} open={true} />);

      expect(screen.queryByText('Test error')).not.toBeInTheDocument();
    });
  });

  describe('Cancel Button', () => {
    it('calls onClose when cancel is clicked', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });

      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not call onConfirm when cancel is clicked', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });

      fireEvent.click(cancelButton);

      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles itemCount of exactly 10000', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={10000}
          itemLabel="results"
        />,
      );
      expect(screen.queryByText(/This evaluation has/)).not.toBeInTheDocument();
    });

    it('handles itemCount of exactly 10001', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={10001}
          itemLabel="results"
        />,
      );
      expect(screen.getByText(/This evaluation has 10,001 results/)).toBeInTheDocument();
    });
  });
});
