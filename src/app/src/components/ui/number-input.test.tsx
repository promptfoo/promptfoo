import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberInput } from './number-input';

describe('NumberInput', () => {
  it('renders input element', () => {
    render(<NumberInput onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<NumberInput label="Test Label" onChange={vi.fn()} />);
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByLabelText('Test Label')).toBeInTheDocument();
  });

  it('renders with helperText', () => {
    render(<NumberInput helperText="Helper text here" onChange={vi.fn()} />);
    expect(screen.getByText('Helper text here')).toBeInTheDocument();
  });

  it('calls onChange with numeric value', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumberInput onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    await user.type(input, '42');
    // Each keystroke triggers onChange - first '4', then '2' appended
    expect(handleChange).toHaveBeenCalled();
    expect(handleChange.mock.calls.some((call) => call[0] === 4 || call[0] === 42)).toBe(true);
  });

  it('calls onChange with undefined when cleared', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumberInput value={5} onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    await user.clear(input);
    expect(handleChange).toHaveBeenCalledWith(undefined);
  });

  it('shows error state with aria-invalid', () => {
    render(<NumberInput error={true} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows error message when error is a string', () => {
    render(<NumberInput error="This is an error" onChange={vi.fn()} />);
    expect(screen.getByText('This is an error')).toBeInTheDocument();
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows helperText when error is boolean true', () => {
    render(<NumberInput error={true} helperText="Helper text" onChange={vi.fn()} />);
    expect(screen.getByText('Helper text')).toBeInTheDocument();
  });

  it('respects disabled state', () => {
    render(<NumberInput disabled onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toBeDisabled();
  });

  it('respects readOnly state', () => {
    render(<NumberInput readOnly value={10} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('readonly');
  });

  it('does not call onChange when readOnly', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumberInput readOnly value={10} onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    await user.type(input, '5');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('blocks e, E, and + keys', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumberInput onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    await user.type(input, 'e');
    await user.type(input, 'E');
    await user.type(input, '+');

    // onChange should not be called with these keys
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('blocks . key when allowDecimals is false', async () => {
    const handleChange = vi.fn();
    render(<NumberInput allowDecimals={false} onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    // Simulate keyDown event for '.' - should be prevented
    const event = new KeyboardEvent('keydown', { key: '.', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    input.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('allows . key when allowDecimals is true', async () => {
    const handleChange = vi.fn();
    render(<NumberInput allowDecimals={true} onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    // Simulate keyDown event for '.' - should NOT be prevented
    const event = new KeyboardEvent('keydown', { key: '.', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    input.dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('blocks - key when min >= 0', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumberInput min={0} onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    await user.type(input, '-5');
    // Should only get 5, not the minus
    expect(handleChange).toHaveBeenCalledWith(5);
  });

  it('allows - key when min is undefined or negative', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumberInput min={-10} onChange={handleChange} />);
    const input = screen.getByRole('spinbutton');

    await user.type(input, '-5');
    expect(handleChange).toHaveBeenCalledWith(-5);
  });

  it('renders endAdornment', () => {
    render(<NumberInput endAdornment={<span>ms</span>} onChange={vi.fn()} />);
    expect(screen.getByText('ms')).toBeInTheDocument();
  });

  it('applies fullWidth class', () => {
    const { container } = render(<NumberInput fullWidth onChange={vi.fn()} />);
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('w-full');
  });

  it('applies custom className to input', () => {
    render(<NumberInput className="custom-class" onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveClass('custom-class');
  });

  it('blurs on wheel event', () => {
    render(<NumberInput onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.wheel(input);
    expect(document.activeElement).not.toBe(input);
  });

  it('sets min, max, and step attributes', () => {
    render(<NumberInput min={0} max={100} step={5} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
    expect(input).toHaveAttribute('step', '5');
  });

  it('handles controlled value', () => {
    const { rerender } = render(<NumberInput value={10} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('10');

    rerender(<NumberInput value={20} onChange={vi.fn()} />);
    expect(input.value).toBe('20');
  });

  it('handles undefined value as empty string', () => {
    render(<NumberInput value={undefined} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('calls onBlur when provided', async () => {
    const user = userEvent.setup();
    const handleBlur = vi.fn();
    render(<NumberInput onBlur={handleBlur} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');

    await user.click(input);
    await user.tab();
    expect(handleBlur).toHaveBeenCalled();
  });

  it('calls onKeyDown when provided', async () => {
    const user = userEvent.setup();
    const handleKeyDown = vi.fn();
    render(<NumberInput onKeyDown={handleKeyDown} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');

    await user.type(input, '5');
    expect(handleKeyDown).toHaveBeenCalled();
  });

  it('sets inputMode to numeric by default', () => {
    render(<NumberInput onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('inputMode', 'numeric');
  });

  it('sets inputMode to decimal when allowDecimals is true', () => {
    render(<NumberInput allowDecimals={true} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('inputMode', 'decimal');
  });
});
