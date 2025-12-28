import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './switch';

describe('Switch', () => {
  it('renders switch', () => {
    render(<Switch />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeInTheDocument();
  });

  it('handles checked state', () => {
    render(<Switch checked onCheckedChange={vi.fn()} />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'checked');
  });

  it('handles unchecked state', () => {
    render(<Switch checked={false} onCheckedChange={vi.fn()} />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'unchecked');
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Switch onCheckedChange={handleChange} />);
    const switchElement = screen.getByRole('switch');

    await user.click(switchElement);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Switch disabled onCheckedChange={handleChange} />);
    const switchElement = screen.getByRole('switch');

    expect(switchElement).toBeDisabled();
    await user.click(switchElement);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Switch className="custom-switch" />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('custom-switch');
  });

  it('applies correct default styles', () => {
    render(<Switch />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('h-6', 'w-11', 'rounded-full');
  });

  it('supports defaultChecked', () => {
    render(<Switch defaultChecked />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'checked');
  });

  it.skip('supports name attribute for forms', () => {
    render(<Switch name="notifications" value="on" />);
    const hiddenInput = document.querySelector('input[name="notifications"]');
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput).toHaveAttribute('value', 'on');
  });

  it('supports value attribute', () => {
    render(<Switch value="enabled" />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('value', 'enabled');
  });
});
