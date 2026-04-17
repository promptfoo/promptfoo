import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import JsonTextField from './JsonTextField';

describe('JsonTextField', () => {
  it('should update value, clear error, and call onChange with parsed object for valid JSON', () => {
    const onChangeMock = vi.fn();
    const validJsonString = '{"foo": "bar", "baz": 123}';
    const expectedParsedObject = { foo: 'bar', baz: 123 };

    render(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

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

    render(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

    const textField = screen.getByLabelText('JSON Input');
    fireEvent.change(textField, { target: { value: validJsonNumber } });

    expect(textField).toHaveValue(validJsonNumber);
    expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith(expectedParsedNumber);
  });
});
