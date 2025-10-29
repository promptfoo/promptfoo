import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditEvalNameDialog } from './EditEvalNameDialog';

describe('EditEvalNameDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    currentName: 'Test Eval',
    onSave: vi.fn().mockResolvedValue(undefined),
  };

  it('should render with current name in text field', () => {
    render(<EditEvalNameDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Eval Name');
    expect(textField).toHaveValue('Test Eval');
  });

  it('should allow user to change the name', () => {
    render(<EditEvalNameDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'New Eval Name' } });

    expect(textField).toHaveValue('New Eval Name');
  });

  it('should call onSave with trimmed new name when save button clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditEvalNameDialog {...defaultProps} onSave={onSave} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: '  New Name  ' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('New Name');
    });
  });

  it('should call onClose after successful save', async () => {
    const onClose = vi.fn();
    render(<EditEvalNameDialog {...defaultProps} onClose={onClose} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'New Name' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should call onClose when cancel button clicked without calling onSave', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<EditEvalNameDialog {...defaultProps} onSave={onSave} onClose={onClose} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('should save when enter key is pressed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditEvalNameDialog {...defaultProps} onSave={onSave} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'New Name' } });
    fireEvent.keyPress(textField, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('New Name');
    });
  });

  it('should not save when enter key is pressed with shift', () => {
    const onSave = vi.fn();
    render(<EditEvalNameDialog {...defaultProps} onSave={onSave} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'New Name' } });
    fireEvent.keyPress(textField, { key: 'Enter', code: 'Enter', charCode: 13, shiftKey: true });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('should disable save button when name is empty', () => {
    render(<EditEvalNameDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it('should disable save button when name is only whitespace', () => {
    render(<EditEvalNameDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: '   ' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it('should disable save button when name has not changed', () => {
    render(<EditEvalNameDialog {...defaultProps} currentName="Test Eval" />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it('should show loading state while saving', async () => {
    const onSave = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    render(<EditEvalNameDialog {...defaultProps} onSave={onSave} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'New Name' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // Should show loading indicator
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    // Save button should be disabled during loading
    expect(saveButton).toBeDisabled();
  });

  it('should display error message when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
    render(<EditEvalNameDialog {...defaultProps} onSave={onSave} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'New Name' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });
  });

  it('should reset to current name when dialog reopens', async () => {
    const { rerender } = render(<EditEvalNameDialog {...defaultProps} open={false} />);

    rerender(<EditEvalNameDialog {...defaultProps} open={true} currentName="Original Name" />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'Changed Name' } });

    rerender(<EditEvalNameDialog {...defaultProps} open={false} currentName="Original Name" />);
    rerender(<EditEvalNameDialog {...defaultProps} open={true} currentName="Original Name" />);

    expect(textField).toHaveValue('Original Name');
  });


  it('should disable inputs while loading', async () => {
    const onSave = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    render(<EditEvalNameDialog {...defaultProps} onSave={onSave} />);

    const textField = screen.getByLabelText('Eval Name');
    fireEvent.change(textField, { target: { value: 'New Name' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(textField).toBeDisabled();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeDisabled();
  });
});
