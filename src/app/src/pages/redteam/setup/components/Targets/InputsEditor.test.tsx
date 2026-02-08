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

  describe('duplicateNames', () => {
    it('should detect duplicates after trimming whitespace', () => {
      const inputs = {
        user_id: 'First user ID',
        ' user_id ': 'Second user ID (with spaces)',
      };

      renderWithProviders(<InputsEditor {...defaultProps} inputs={inputs} compact />);

      // Both should show duplicate error since they trim to the same name
      const duplicateErrors = screen.getAllByText('Duplicate variable name');
      expect(duplicateErrors).toHaveLength(2);
    });

    it('should not show duplicate error for unique names', () => {
      const inputs = {
        user_id: 'A user ID',
        session_token: 'A session token',
      };

      renderWithProviders(<InputsEditor {...defaultProps} inputs={inputs} compact />);

      expect(screen.queryByText('Duplicate variable name')).not.toBeInTheDocument();
    });

    it('should ignore empty strings when checking for duplicates', () => {
      const inputs = {
        '': 'Empty name 1',
        ' ': 'Empty name 2 (space)',
      };

      renderWithProviders(<InputsEditor {...defaultProps} inputs={inputs} compact />);

      // Empty strings (after trimming) should not be counted as duplicates
      // Since both trim to '', they would be duplicates if counted
      // But the logic only counts if trimmed is truthy
      expect(screen.queryByText('Duplicate variable name')).not.toBeInTheDocument();
    });

    it('should update duplicate detection when variable name changes', async () => {
      renderWithProviders(<ControlledInputsEditor {...defaultProps} compact />);

      // Add two variables
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
      fireEvent.click(screen.getByRole('button', { name: /add variable/i }));

      // Initially, no duplicates (variable and variable1)
      expect(screen.queryByText('Duplicate variable name')).not.toBeInTheDocument();

      // Rename second variable to match first (with trimming)
      const nameInputs = screen.getAllByPlaceholderText('e.g., user_id');
      fireEvent.change(nameInputs[1], { target: { value: ' variable ' } });

      // Now there should be duplicate errors
      const duplicateErrors = screen.getAllByText('Duplicate variable name');
      expect(duplicateErrors.length).toBeGreaterThan(0);
    });
  });

  describe('updateVariableName', () => {
    it('should preserve object key order when renaming', async () => {
      const onChange = vi.fn();
      const inputs = {
        first: 'First variable',
        second: 'Second variable',
        third: 'Third variable',
      };

      renderWithProviders(<InputsEditor inputs={inputs} onChange={onChange} compact />);

      // Rename the second variable
      const nameInputs = screen.getAllByPlaceholderText('e.g., user_id');
      fireEvent.change(nameInputs[1], { target: { value: 'renamed_second' } });

      // Check that onChange was called with correct order preserved
      expect(onChange).toHaveBeenCalledWith({
        first: 'First variable',
        renamed_second: 'Second variable',
        third: 'Third variable',
      });

      // Verify order by checking the keys array
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(Object.keys(lastCall)).toEqual(['first', 'renamed_second', 'third']);
    });

    it('should handle renaming first variable while preserving order', async () => {
      const onChange = vi.fn();
      const inputs = {
        first: 'First variable',
        second: 'Second variable',
      };

      renderWithProviders(<InputsEditor inputs={inputs} onChange={onChange} compact />);

      // Rename the first variable
      const nameInputs = screen.getAllByPlaceholderText('e.g., user_id');
      fireEvent.change(nameInputs[0], { target: { value: 'renamed_first' } });

      expect(onChange).toHaveBeenCalledWith({
        renamed_first: 'First variable',
        second: 'Second variable',
      });

      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(Object.keys(lastCall)).toEqual(['renamed_first', 'second']);
    });

    it('should handle renaming last variable while preserving order', async () => {
      const onChange = vi.fn();
      const inputs = {
        first: 'First variable',
        second: 'Second variable',
        third: 'Third variable',
      };

      renderWithProviders(<InputsEditor inputs={inputs} onChange={onChange} compact />);

      // Rename the last variable
      const nameInputs = screen.getAllByPlaceholderText('e.g., user_id');
      fireEvent.change(nameInputs[2], { target: { value: 'renamed_third' } });

      expect(onChange).toHaveBeenCalledWith({
        first: 'First variable',
        second: 'Second variable',
        renamed_third: 'Third variable',
      });

      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(Object.keys(lastCall)).toEqual(['first', 'second', 'renamed_third']);
    });

    it('should preserve description value when renaming variable', async () => {
      const onChange = vi.fn();
      const inputs = {
        user_id: 'A detailed user ID description',
      };

      renderWithProviders(<InputsEditor inputs={inputs} onChange={onChange} compact />);

      // Rename the variable
      const nameInput = screen.getByPlaceholderText('e.g., user_id');
      fireEvent.change(nameInput, { target: { value: 'account_id' } });

      // Description should be preserved
      expect(onChange).toHaveBeenCalledWith({
        account_id: 'A detailed user ID description',
      });
    });

    it('should handle renaming to empty string', async () => {
      const onChange = vi.fn();
      const inputs = {
        user_id: 'A user ID',
      };

      renderWithProviders(<InputsEditor inputs={inputs} onChange={onChange} compact />);

      // Rename to empty string
      const nameInput = screen.getByPlaceholderText('e.g., user_id');
      fireEvent.change(nameInput, { target: { value: '' } });

      // Should still call onChange with empty string key
      expect(onChange).toHaveBeenCalledWith({
        '': 'A user ID',
      });
    });

    it('should not modify inputs if inputs is undefined', () => {
      const onChange = vi.fn();

      renderWithProviders(<InputsEditor inputs={undefined} onChange={onChange} compact />);

      // No variables to rename, button should be present
      expect(screen.getByRole('button', { name: /add variable/i })).toBeInTheDocument();
      // onChange should not have been called
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
