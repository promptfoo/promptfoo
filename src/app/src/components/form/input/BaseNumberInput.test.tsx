import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect, vi } from 'vitest';
import { BaseNumberInput } from './BaseNumberInput';

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('BaseNumberInput', () => {
  it('calls onChange with a positive number value', () => {
    const handleChange = vi.fn();

    renderWithTheme(<BaseNumberInput label="Amount" onChange={handleChange} />);

    const input = screen.getByLabelText('Amount');

    fireEvent.change(input, { target: { value: '42' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(42);
  });

  it('calls onChange with a negative number value', () => {
    const handleChange = vi.fn();

    renderWithTheme(<BaseNumberInput label="Temperature" onChange={handleChange} />);

    const input = screen.getByLabelText('Temperature');

    fireEvent.change(input, { target: { value: '-7' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(-7);
  });

  it('provides undefined to onChange when the input is cleared', () => {
    const handleChange = vi.fn();

    renderWithTheme(<BaseNumberInput label="Count" onChange={handleChange} />);

    const input = screen.getByLabelText('Count');

    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(handleChange).toHaveBeenCalledTimes(2);
    expect(handleChange).toHaveBeenLastCalledWith(undefined);
  });

  it('does not call onChange when using the mouse wheel', () => {
    const handleChange = vi.fn();

    renderWithTheme(<BaseNumberInput label="Amount" value={5} onChange={handleChange} />);

    const input = screen.getByLabelText('Amount');

    fireEvent.wheel(input, { deltaY: -100 });

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('ignores letter input and does not call onChange', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithTheme(<BaseNumberInput label="Amount" defaultValue={2} onChange={handleChange} />);

    const input = screen.getByLabelText('Amount');

    await user.type(input, 'abc');

    expect(handleChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(2);
  });

  it('blocks scientific notation characters e and E', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithTheme(<BaseNumberInput label="Score" defaultValue={10} onChange={handleChange} />);

    const input = screen.getByLabelText('Score');

    await user.type(input, 'eE');

    expect(handleChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(10);
  });

  it('prevents plus and minus when not allowed by min and key filters', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithTheme(
      <BaseNumberInput label="Non-negative" defaultValue={1} min={0} onChange={handleChange} />,
    );

    const input = screen.getByLabelText('Non-negative');

    await user.type(input, '+-');

    expect(handleChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(1);
  });

  it('skips onChange when the input is readonly', () => {
    const handleChange = vi.fn();

    renderWithTheme(
      <BaseNumberInput
        label="Read only"
        value={3}
        onChange={handleChange}
        slotProps={{ input: { readOnly: true } }}
      />,
    );

    const input = screen.getByLabelText('Read only');

    fireEvent.change(input, { target: { value: '5' } });

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('prevents decimal typing when inputMode is numeric', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithTheme(<BaseNumberInput label="Integer" defaultValue={4} onChange={handleChange} />);

    const input = screen.getByLabelText('Integer');

    await user.type(input, '.');

    expect(handleChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(4);
  });

  it('allows decimal typing when inputMode allows it', () => {
    const handleChange = vi.fn();

    renderWithTheme(
      <BaseNumberInput
        label="Decimal"
        onChange={handleChange}
        slotProps={{ input: { inputProps: { inputMode: 'decimal' } } }}
      />,
    );

    const input = screen.getByLabelText('Decimal');

    fireEvent.change(input, { target: { value: '3.14' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(3.14);
  });

  it('should pass min and max attributes to the input element', () => {
    const handleChange = vi.fn();
    const min = 5;
    const max = 10;

    renderWithTheme(
      <BaseNumberInput label="Range" min={min} max={max} onChange={handleChange} value={7} />,
    );

    const input = screen.getByLabelText('Range');
    expect(input).toHaveAttribute('min', '5');
    expect(input).toHaveAttribute('max', '10');
  });

  it('calls onChange with a value above the specified max prop', () => {
    const handleChange = vi.fn();

    renderWithTheme(<BaseNumberInput label="Quantity" onChange={handleChange} max={100} />);

    const input = screen.getByLabelText('Quantity');

    fireEvent.change(input, { target: { value: '200' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(200);
  });

  it('calls onChange with a number exceeding Number.MAX_SAFE_INTEGER', () => {
    const handleChange = vi.fn();
    const largeNumber = Number.MAX_SAFE_INTEGER + 1;

    renderWithTheme(<BaseNumberInput label="Large Number" onChange={handleChange} />);

    const input = screen.getByLabelText('Large Number');

    fireEvent.change(input, { target: { value: String(largeNumber) } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(largeNumber);
  });
});
