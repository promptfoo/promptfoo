import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    // Note: Do NOT use vi.useFakeTimers() here - it breaks userEvent interactions
    // Default mockOnConfirm to return a resolved promise so async flows complete
    mockOnConfirm.mockResolvedValue(undefined);
  });

  afterEach(() => {
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
      const helperText = 'Custom helper text';
      render(<ConfirmEvalNameDialog {...defaultProps} helperText={helperText} />);
      expect(screen.getByText(helperText)).toBeInTheDocument();
    });

    it('shows default helper text when not provided', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      expect(screen.getByText(/Enter a name for this evaluation/i)).toBeInTheDocument();
    });

    it('shows processing message with formatted itemCount when isLoading is true and itemCount is provided, overriding custom helperText', async () => {
      const itemCount = 12345;
      const itemLabel = 'widgets';
      const customHelperText = 'This is a custom helper text.';

      let resolveConfirm: () => void;
      const confirmPromise = new Promise<void>((resolve) => {
        resolveConfirm = resolve;
      });

      const mockOnConfirmAsync = vi.fn().mockReturnValue(confirmPromise);

      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          currentName="Different Name"
          itemCount={itemCount}
          itemLabel={itemLabel}
          helperText={customHelperText}
          onConfirm={mockOnConfirmAsync}
        />,
      );

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(
          screen.getByText(`Processing ${itemCount.toLocaleString()} ${itemLabel}...`),
        ).toBeInTheDocument();
      });

      expect(screen.queryByText(customHelperText)).not.toBeInTheDocument();

      resolveConfirm!();
    });
  });

  describe('Size Warnings', () => {
    it('does not show warning for small operations', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={100}
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
          itemCount={25000}
          itemLabel="results"
        />,
      );
      expect(screen.getByText(/This evaluation has 25,000 results/)).toBeInTheDocument();
      expect(screen.getByText(/This operation may take up to a minute./)).toBeInTheDocument();
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
          itemCount={25000}
          itemLabel="test cases"
        />,
      );
      expect(screen.getByText(/test cases/)).toBeInTheDocument();
    });

    it('does not show warning when showSizeWarning is false', () => {
      render(
        <ConfirmEvalNameDialog {...defaultProps} showSizeWarning={false} itemCount={100000} />,
      );
      expect(screen.queryByText(/This evaluation has/)).not.toBeInTheDocument();
    });
  });

  describe('Button States', () => {
    it('disables confirm button when name has not changed (rename mode)', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} currentName="Current Name" />);
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeDisabled();
    });

    it('enables confirm button for copy mode even with default name', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          currentName="Test Name"
          showSizeWarning={true}
          itemCount={1000}
        />,
      );
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).not.toBeDisabled();
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
      // Should not show warning at exactly 10000
      expect(screen.queryByText(/This evaluation has 10,000 results/)).not.toBeInTheDocument();
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
      // Should show warning at 10001
      expect(screen.getByText(/This evaluation has 10,001 results/)).toBeInTheDocument();
    });

    it('handles itemCount of exactly 50000', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={50000}
          itemLabel="results"
        />,
      );
      // Should show info alert, not warning
      expect(screen.getByText(/This evaluation has 50,000 results/)).toBeInTheDocument();
      expect(screen.getByText(/This operation may take up to a minute./)).toBeInTheDocument();
    });

    it('handles itemCount of exactly 50001', () => {
      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          showSizeWarning={true}
          itemCount={50001}
          itemLabel="results"
        />,
      );
      // Should show warning alert
      expect(screen.getByText(/This evaluation has 50,001 results/)).toBeInTheDocument();
      expect(screen.getByText(/This operation may take several minutes./)).toBeInTheDocument();
    });

    it('handles empty string as currentName', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} currentName="" />);
      const input = screen.getByLabelText('Name') as HTMLInputElement;
      expect(input.value).toBe('');

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeDisabled();
    });
  });
  describe('Component Props', () => {
    it('accepts and displays custom title', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} title="Custom Title" />);
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('accepts and displays custom label', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} label="Custom Label" />);
      expect(screen.getByLabelText('Custom Label')).toBeInTheDocument();
    });

    it('accepts and displays custom action button text', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} actionButtonText="Save Changes" />);
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });

    it('uses default itemLabel when not provided', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} showSizeWarning={true} itemCount={25000} />);
      expect(screen.getByText(/items/)).toBeInTheDocument();
    });
  });

  describe('User Input Edge Cases', () => {
    it('should call onConfirm with the trimmed value when input contains leading/trailing whitespace', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '  Test Name  ' } });
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);
      expect(mockOnConfirm).toHaveBeenCalledWith('Test Name');
    });

    it('should disable confirm button and prevent onConfirm when name contains only whitespace', async () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name') as HTMLInputElement;
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.change(input, { target: { value: '   \t\n  ' } });
      expect(confirmButton).toBeDisabled();

      fireEvent.click(confirmButton);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('displays error message and remains open when onConfirm throws an error', async () => {
      const errorMessage = 'Failed to confirm';
      mockOnConfirm.mockRejectedValue(new Error(errorMessage));

      render(<ConfirmEvalNameDialog {...defaultProps} />);

      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'New Name' } });

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.getByText('Test Dialog')).toBeInTheDocument();
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('displays "Operation failed" when onConfirm throws a non-Error object', async () => {
      const errorMessage = 'Operation failed';
      mockOnConfirm.mockRejectedValue('Non-error object');

      render(<ConfirmEvalNameDialog {...defaultProps} onConfirm={mockOnConfirm} />);

      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'New Name' } });

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);

      await screen.findByText(errorMessage);

      expect(screen.getByText(errorMessage)).toBeVisible();
    });

    it('clears error state when input field is modified after an error', async () => {
      mockOnConfirm.mockImplementation(() => Promise.reject(new Error('Test Error')));
      render(<ConfirmEvalNameDialog {...defaultProps} />);

      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Changed Name' } });

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);

      await screen.findByText('Test Error');

      fireEvent.change(input, { target: { value: 'New Name' } });

      expect(screen.queryByText('Test Error')).toBeNull();
    });
  });

  describe('Loading State', () => {
    it('disables buttons and shows loading indicator while confirm action is in progress', async () => {
      let resolveConfirm: () => void;
      const confirmPromise = new Promise<void>((resolve) => {
        resolveConfirm = resolve;
      });

      const mockOnConfirm = vi.fn().mockReturnValue(confirmPromise);

      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          onConfirm={mockOnConfirm}
          currentName="Current Name"
        />,
      );

      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'New Name' } });

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

      expect(input).toBeDisabled();

      resolveConfirm!();
    });
  });

  describe('Timing of onClose callback', () => {
    it('should call onClose only after onConfirm promise resolves', async () => {
      const newName = 'New Eval Name';

      let resolveConfirmPromise: () => void;
      mockOnConfirm.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveConfirmPromise = resolve;
          }),
      );

      render(
        <ConfirmEvalNameDialog
          {...defaultProps}
          onConfirm={mockOnConfirm}
          currentName="Old Name"
        />,
      );

      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: newName } });

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).toHaveBeenCalledWith(newName);

      expect(mockOnClose).not.toHaveBeenCalled();

      // Resolve the confirm promise to trigger onClose
      await act(async () => {
        resolveConfirmPromise!();
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cancel Button', () => {
    it('should invoke onClose and not onConfirm when Cancel button is clicked after input field is modified', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'New Name' } });
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard interaction', () => {
    it('should trigger the confirm action when Enter is pressed in the input field', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      const inputElement = screen.getByLabelText('Name');

      fireEvent.change(inputElement, { target: { value: 'New Name' } });
      fireEvent.keyDown(inputElement, { key: 'Enter', code: 'Enter', charCode: 13 });

      expect(mockOnConfirm).toHaveBeenCalledWith('New Name');
    });
  });

  it('should prevent closing via onClose when isLoading is true', async () => {
    const delayedConfirm = vi.fn((_newName: string) => new Promise<void>(() => {}));

    render(<ConfirmEvalNameDialog {...defaultProps} onConfirm={delayedConfirm} />);

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'New Name' } });

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await screen.findByText('Processing...');

    const cancelButton = screen.getByText('Cancel');
    expect(cancelButton).toBeDisabled();

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should call onConfirm with the trimmed name and then call onClose when the confirm button is clicked and the name is valid', async () => {
    render(<ConfirmEvalNameDialog {...defaultProps} />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   New Name   ' } });
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmButton);
    expect(mockOnConfirm).toHaveBeenCalledWith('New Name');
    // Wait for onClose to be called (dialog closes after successful confirmation)
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('auto-focuses and selects the input field when the dialog opens', async () => {
    render(<ConfirmEvalNameDialog {...defaultProps} />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    });
  });

  it('updates name state when currentName prop changes while open', () => {
    const { rerender } = render(<ConfirmEvalNameDialog {...defaultProps} />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    expect(input.value).toBe('Current Name');

    rerender(<ConfirmEvalNameDialog {...defaultProps} currentName="New Name" />);
    expect(input.value).toBe('New Name');
  });

  it('clears error state when currentName prop changes while open', () => {
    const { rerender } = render(<ConfirmEvalNameDialog {...defaultProps} />);
    const _input = screen.getByLabelText('Name') as HTMLInputElement;
    const helperText = 'Enter a name for this evaluation';

    rerender(<ConfirmEvalNameDialog {...defaultProps} helperText="Error Message" />);

    rerender(<ConfirmEvalNameDialog {...defaultProps} currentName="New Name" />);
    expect(screen.getByText(helperText)).toBeInTheDocument();
  });

  describe('State Reset on Rapid Open/Close', () => {
    it('resets isLoading state when dialog is closed during loading and reopened with a different currentName', async () => {
      const user = userEvent.setup();

      // Use a promise that never resolves to simulate loading state
      const delayedConfirm = vi.fn(() => new Promise<void>(() => {}));

      const props = {
        ...defaultProps,
        onConfirm: delayedConfirm,
        itemCount: 1000,
      };

      const { rerender } = render(<ConfirmEvalNameDialog {...props} />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      await user.click(confirmButton);

      rerender(<ConfirmEvalNameDialog {...props} open={false} />);

      const newProps = { ...props, currentName: 'New Name' };
      rerender(<ConfirmEvalNameDialog {...newProps} />);

      const button = screen.getByRole('button', { name: 'Confirm' });
      expect(button).toHaveTextContent('Confirm');
      expect(button).not.toHaveTextContent('Processing...');
    });
  });
});
