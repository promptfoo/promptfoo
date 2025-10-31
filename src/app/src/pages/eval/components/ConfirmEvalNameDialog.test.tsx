import { render, screen } from '@testing-library/react';
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
      const helperText = 'Custom helper text';
      render(<ConfirmEvalNameDialog {...defaultProps} helperText={helperText} />);
      expect(screen.getByText(helperText)).toBeInTheDocument();
    });

    it('shows default helper text when not provided', () => {
      render(<ConfirmEvalNameDialog {...defaultProps} />);
      expect(screen.getByText(/Enter a name for this evaluation/i)).toBeInTheDocument();
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
});
