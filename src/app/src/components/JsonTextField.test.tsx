import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import JsonTextField from './JsonTextField';

describe('JsonTextField', () => {
  it('should update value, clear error, and call onChange with parsed object for valid JSON', async () => {
    const user = userEvent.setup();
    const onChangeMock = vi.fn();
    const validJsonString = '{"foo": "bar", "baz": 123}';
    const expectedParsedObject = { foo: 'bar', baz: 123 };

    render(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

    const textField = screen.getByLabelText('JSON Input');
    await user.click(textField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(validJsonString);

    expect(textField).toHaveValue(validJsonString);

    expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith(expectedParsedObject);
  });

  it('should update value and call onChange with parsed number for valid JSON number primitive', async () => {
    const user = userEvent.setup();
    const onChangeMock = vi.fn();
    const validJsonNumber = '42';
    const expectedParsedNumber = 42;

    render(<JsonTextField label="JSON Input" onChange={onChangeMock} />);

    const textField = screen.getByLabelText('JSON Input');
    await user.click(textField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(validJsonNumber);

    expect(textField).toHaveValue(validJsonNumber);
    expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith(expectedParsedNumber);
  });
});
