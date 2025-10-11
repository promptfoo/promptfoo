import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import JsonTextField from './JsonTextField';

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('JsonTextField', () => {
  describe('Valid JSON handling', () => {
    it('should update value, clear error, and call onChange with parsed object for valid JSON', () => {
      const onChangeMock = vi.fn();
      const validJsonString = '{"foo": "bar", "baz": 123}';
      const expectedParsedObject = { foo: 'bar', baz: 123 };

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: validJsonString } });

      expect(textField).toHaveValue(validJsonString);
      expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith(expectedParsedObject);
    });

    it('should update value and call onChange with parsed number for valid JSON number primitive', () => {
      const onChangeMock = vi.fn();
      const validJsonNumber = '42';
      const expectedParsedNumber = 42;

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: validJsonNumber } });

      expect(textField).toHaveValue(validJsonNumber);
      expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith(expectedParsedNumber);
    });

    it('should handle valid JSON arrays', () => {
      const onChangeMock = vi.fn();
      const validJsonArray = '[1, 2, 3]';
      const expectedParsedArray = [1, 2, 3];

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: validJsonArray } });

      expect(onChangeMock).toHaveBeenCalledWith(expectedParsedArray);
    });

    it('should handle empty JSON object', () => {
      const onChangeMock = vi.fn();

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: '{}' } });

      expect(onChangeMock).toHaveBeenCalledWith({});
    });
  });

  describe('Invalid JSON handling', () => {
    it('should show error for invalid JSON', () => {
      const onChangeMock = vi.fn();
      const invalidJson = '{foo: bar}'; // Missing quotes

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: invalidJson } });

      expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
      expect(onChangeMock).toHaveBeenCalledWith(null, 'Invalid JSON');
    });

    it('should show error for incomplete JSON', () => {
      const onChangeMock = vi.fn();
      const incompleteJson = '{"foo": ';

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: incompleteJson } });

      expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
    });
  });

  describe('defaultValue handling', () => {
    it('should initialize with defaultValue', () => {
      const defaultValue = '{"initial": "value"}';

      renderWithTheme(<JsonTextField label="JSON Input" defaultValue={defaultValue} />);

      const textField = screen.getByLabelText('JSON Input') as HTMLInputElement;
      expect(textField.value).toBe(defaultValue);
    });

    it('should maintain user edits when using uncontrolled component', () => {
      const onChangeMock = vi.fn();
      const initialValue = '{"initial": "value"}';

      renderWithTheme(
        <JsonTextField label="JSON Input" defaultValue={initialValue} onChange={onChangeMock} />,
      );

      const textField = screen.getByLabelText('JSON Input') as HTMLInputElement;
      expect(textField.value).toBe(initialValue);

      // User makes an edit
      const userEdit = '{"edited": "by user"}';
      fireEvent.change(textField, { target: { value: userEdit } });

      // Value should update to user's edit
      expect(textField.value).toBe(userEdit);
      expect(onChangeMock).toHaveBeenCalledWith({ edited: 'by user' });
    });

    it('should work as controlled component with value prop', () => {
      const onChangeMock = vi.fn();
      const controlledValue = '{"controlled": "value"}';

      const { rerender } = renderWithTheme(
        <JsonTextField label="JSON Input" value={controlledValue} onChange={onChangeMock} />,
      );

      let textField = screen.getByLabelText('JSON Input') as HTMLInputElement;
      expect(textField.value).toBe(controlledValue);

      // Update controlled value
      const newValue = '{"updated": "value"}';
      rerender(
        <ThemeProvider theme={createTheme()}>
          <JsonTextField label="JSON Input" value={newValue} onChange={onChangeMock} />
        </ThemeProvider>,
      );

      textField = screen.getByLabelText('JSON Input') as HTMLInputElement;
      expect(textField.value).toBe(newValue);
    });
  });

  describe('Error display with helper text', () => {
    it('should override helperText with error when JSON is invalid', () => {
      const helperText = 'Enter your JSON configuration';

      renderWithTheme(
        <JsonTextField label="JSON Input" helperText={helperText} onChange={vi.fn()} />,
      );

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: 'invalid' } });

      expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
      expect(screen.queryByText(helperText)).not.toBeInTheDocument();
    });

    it('should show helperText when JSON is valid', () => {
      const helperText = 'Enter your JSON configuration';
      const onChangeMock = vi.fn();

      renderWithTheme(
        <JsonTextField label="JSON Input" helperText={helperText} onChange={onChangeMock} />,
      );

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: '{"valid": true}' } });

      expect(screen.getByText(helperText)).toBeInTheDocument();
      expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('should handle null values', () => {
      const onChangeMock = vi.fn();

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: 'null' } });

      expect(onChangeMock).toHaveBeenCalledWith(null);
      expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
    });

    it('should handle boolean values', () => {
      const onChangeMock = vi.fn();

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: 'true' } });

      expect(onChangeMock).toHaveBeenCalledWith(true);
    });

    it('should handle string values', () => {
      const onChangeMock = vi.fn();

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: '"hello"' } });

      expect(onChangeMock).toHaveBeenCalledWith('hello');
    });

    it('should handle nested objects', () => {
      const onChangeMock = vi.fn();
      const nestedJson = '{"outer": {"inner": {"deep": "value"}}}';

      renderWithTheme(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

      const textField = screen.getByLabelText('JSON Input');
      fireEvent.change(textField, { target: { value: nestedJson } });

      expect(onChangeMock).toHaveBeenCalledWith({
        outer: { inner: { deep: 'value' } },
      });
    });
  });

  describe('Component lifecycle', () => {
    it('should not call onChange on initial render', () => {
      const onChangeMock = vi.fn();

      renderWithTheme(
        <JsonTextField label="JSON Input" defaultValue='{"test": true}' onChange={onChangeMock} />,
      );

      expect(onChangeMock).not.toHaveBeenCalled();
    });

    it('should work without onChange callback', () => {
      renderWithTheme(<JsonTextField label="JSON Input" />);

      const textField = screen.getByLabelText('JSON Input');

      // Should not throw error
      expect(() => {
        fireEvent.change(textField, { target: { value: '{"test": true}' } });
      }).not.toThrow();
    });
  });

  describe('Props passthrough', () => {
    it('should pass through TextField props', () => {
      renderWithTheme(
        <JsonTextField
          label="JSON Input"
          placeholder="Enter JSON"
          disabled={false}
          multiline
          rows={4}
        />,
      );

      const textField = screen.getByLabelText('JSON Input');
      expect(textField).toHaveAttribute('placeholder', 'Enter JSON');
    });

    it('should handle disabled state', () => {
      renderWithTheme(<JsonTextField label="JSON Input" disabled />);

      const textField = screen.getByLabelText('JSON Input');
      expect(textField).toBeDisabled();
    });
  });
});
