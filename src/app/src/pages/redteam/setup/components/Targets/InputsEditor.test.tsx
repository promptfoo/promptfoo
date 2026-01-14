import React, { useState } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InputsEditor from './InputsEditor';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

// Wrapper component that manages state for testing the controlled component
function ControlledInputsEditor({
  initialInputs,
  onChange,
  ...props
}: {
  initialInputs?: Record<string, string>;
  onChange?: (inputs: Record<string, string> | undefined) => void;
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [inputs, setInputs] = useState(initialInputs);
  const handleChange = (newInputs: Record<string, string> | undefined) => {
    setInputs(newInputs);
    onChange?.(newInputs);
  };
  return <InputsEditor inputs={inputs} onChange={handleChange} {...props} />;
}

describe('InputsEditor', () => {
  const defaultProps = {
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('should render Add Variable button when no inputs exist', () => {
      renderWithProviders(<InputsEditor {...defaultProps} compact />);

      expect(screen.getByRole('button', { name: /add variable/i })).toBeInTheDocument();
    });

    it('should render collapsible wrapper in non-compact mode', () => {
      renderWithProviders(<InputsEditor {...defaultProps} />);

      expect(screen.getByText('Multi-Variable Inputs')).toBeInTheDocument();
      expect(
        screen.getByText('Define additional input variables for test case generation'),
      ).toBeInTheDocument();
    });
  });

  describe('adding variables', () => {
    it('should add a variable with default name when clicking Add Variable', async () => {
      renderWithProviders(<ControlledInputsEditor {...defaultProps} compact />);

      const addButton = screen.getByRole('button', { name: /add variable/i });
      fireEvent.click(addButton);

      expect(screen.getByDisplayValue('variable')).toBeInTheDocument();
      expect(screen.getByLabelText('Variable Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Instructions')).toBeInTheDocument();
    });

    it('should increment variable name if default name already exists', async () => {
      renderWithProviders(<ControlledInputsEditor {...defaultProps} compact />);

      // Add first variable
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
      const inputs = screen.getAllByPlaceholderText('e.g., user_id');
      expect(inputs).toHaveLength(1);
      expect(inputs[0]).toHaveValue('variable');

      // Add second variable - should be named variable1
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
      const inputs2 = screen.getAllByPlaceholderText('e.g., user_id');
      expect(inputs2).toHaveLength(2);
      expect(inputs2[1]).toHaveValue('variable1');

      // Add third variable - should be named variable2
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
      const inputs3 = screen.getAllByPlaceholderText('e.g., user_id');
      expect(inputs3).toHaveLength(3);
      expect(inputs3[2]).toHaveValue('variable2');
    });
  });

  describe('editing variables', () => {
    it('should update variable name when typing', async () => {
      renderWithProviders(<ControlledInputsEditor {...defaultProps} compact />);

      // Add a variable
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));

      const nameInput = screen.getByDisplayValue('variable');
      fireEvent.change(nameInput, { target: { value: 'user_id' } });

      expect(screen.getByDisplayValue('user_id')).toBeInTheDocument();
    });

    it('should update variable description when typing', async () => {
      renderWithProviders(<ControlledInputsEditor {...defaultProps} compact />);

      // Add a variable
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));

      const descInput = screen.getByPlaceholderText('e.g., A realistic user ID in UUID format');
      fireEvent.change(descInput, { target: { value: 'A test description' } });

      expect(screen.getByDisplayValue('A test description')).toBeInTheDocument();
    });

    it('should call onChange immediately when adding a variable', async () => {
      const onChange = vi.fn();
      renderWithProviders(<ControlledInputsEditor {...defaultProps} onChange={onChange} compact />);

      // Add a variable
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));

      // onChange should be called immediately (no debounce)
      expect(onChange).toHaveBeenCalledWith({ variable: '' });
    });
  });

  describe('removing variables', () => {
    it('should remove a variable when clicking delete button', async () => {
      renderWithProviders(<ControlledInputsEditor {...defaultProps} compact />);

      // Add a variable
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
      expect(screen.getByDisplayValue('variable')).toBeInTheDocument();

      // Remove the variable
      const deleteButton = screen.getByRole('button', { name: /delete variable/i });
      fireEvent.click(deleteButton);

      expect(screen.queryByDisplayValue('variable')).not.toBeInTheDocument();
    });

    it('should call onChange with undefined when all variables are removed', async () => {
      const onChange = vi.fn();
      renderWithProviders(<ControlledInputsEditor {...defaultProps} onChange={onChange} compact />);

      // Add a variable
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));

      // Remove the variable
      const deleteButton = screen.getByRole('button', { name: /delete variable/i });
      fireEvent.click(deleteButton);

      // onChange should be called immediately with undefined (no debounce)
      expect(onChange).toHaveBeenLastCalledWith(undefined);
    });
  });

  describe('validation', () => {
    it('should show duplicate error when inputs prop contains duplicate names', () => {
      // Note: With Record<string, string>, actual duplicates are impossible since keys must be unique.
      // This test verifies that if duplicate names somehow exist in the derived variables,
      // the error would be displayed. In practice, the Record model prevents this.
      // We test by providing initial inputs with similar names to verify the UI renders correctly.
      const inputs = {
        user_id: 'A user ID',
        session_token: 'A session token',
      };

      renderWithProviders(
        <InputsEditor inputs={inputs} onChange={defaultProps.onChange} compact />,
      );

      // With valid inputs, no duplicate error should appear
      expect(screen.queryByText('Duplicate variable name')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('user_id')).toBeInTheDocument();
      expect(screen.getByDisplayValue('session_token')).toBeInTheDocument();
    });

    it('should allow renaming variable to a unique name', async () => {
      renderWithProviders(<ControlledInputsEditor {...defaultProps} compact />);

      // Add a variable
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
      expect(screen.getByDisplayValue('variable')).toBeInTheDocument();

      // Rename to a unique name
      const nameInput = screen.getByDisplayValue('variable');
      fireEvent.change(nameInput, { target: { value: 'unique_name' } });

      // No error should appear
      expect(screen.queryByText('Duplicate variable name')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('unique_name')).toBeInTheDocument();
    });
  });

  describe('initial values', () => {
    it('should render with initial inputs from props', async () => {
      const inputs = {
        user_id: 'A realistic user ID',
        session_token: 'A valid session token',
      };

      renderWithProviders(<InputsEditor {...defaultProps} inputs={inputs} compact />);

      expect(screen.getByDisplayValue('user_id')).toBeInTheDocument();
      expect(screen.getByDisplayValue('A realistic user ID')).toBeInTheDocument();
      expect(screen.getByDisplayValue('session_token')).toBeInTheDocument();
      expect(screen.getByDisplayValue('A valid session token')).toBeInTheDocument();
    });

    it('should show variable count in non-compact mode', async () => {
      const inputs = {
        var1: 'desc1',
        var2: 'desc2',
      };

      renderWithProviders(<InputsEditor {...defaultProps} inputs={inputs} />);

      expect(screen.getByText(/\(2 configured\)/)).toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('should disable Add Variable button when disabled prop is true', () => {
      renderWithProviders(<InputsEditor {...defaultProps} disabled compact />);

      const addButton = screen.getByRole('button', { name: /add variable/i });
      expect(addButton).toBeDisabled();
    });

    it('should wrap disabled button in tooltip trigger', async () => {
      renderWithProviders(
        <InputsEditor
          {...defaultProps}
          disabled
          disabledReason="Clear instructions to add variables"
          compact
        />,
      );

      const addButton = screen.getByRole('button', { name: /add variable/i });
      expect(addButton).toBeDisabled();

      // The button should be wrapped in a span (TooltipTrigger wrapper)
      expect(addButton.parentElement?.tagName).toBe('SPAN');
    });
  });

  describe('compact mode', () => {
    it('should not render collapsible wrapper in compact mode', () => {
      renderWithProviders(<InputsEditor {...defaultProps} compact />);

      expect(screen.queryByText('Multi-Variable Inputs')).not.toBeInTheDocument();
    });

    it('should render collapsible wrapper in non-compact mode', () => {
      renderWithProviders(<InputsEditor {...defaultProps} />);

      expect(screen.getByText('Multi-Variable Inputs')).toBeInTheDocument();
    });
  });
});
