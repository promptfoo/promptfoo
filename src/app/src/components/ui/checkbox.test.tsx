import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('renders checkbox', () => {
    render(<Checkbox />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
  });

  it('handles checked state', () => {
    render(<Checkbox checked onChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('handles unchecked state', () => {
    render(<Checkbox checked={false} onChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Checkbox onChange={handleChange} />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(handleChange).toHaveBeenCalled();
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Checkbox disabled onChange={handleChange} />);
    const checkbox = screen.getByRole('checkbox');

    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('handles indeterminate state', () => {
    render(<Checkbox indeterminate />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.indeterminate).toBe(true);
  });

  it('renders check icon when checked', () => {
    const { container } = render(<Checkbox checked onChange={vi.fn()} />);
    const checkIcon = container.querySelector('svg');
    expect(checkIcon).toBeInTheDocument();
  });

  it('renders minus icon when indeterminate', () => {
    const { container } = render(<Checkbox indeterminate />);
    const minusIcon = container.querySelector('svg');
    expect(minusIcon).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Checkbox className="custom-checkbox" />);
    const visualCheckbox = container.querySelector('.custom-checkbox');
    expect(visualCheckbox).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Checkbox ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });

  it('supports defaultChecked', () => {
    render(<Checkbox defaultChecked />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('supports name attribute for forms', () => {
    render(<Checkbox name="terms" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('name', 'terms');
  });

  it('supports value attribute', () => {
    render(<Checkbox value="accepted" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('value', 'accepted');
  });

  it('stops click propagation to prevent double-toggle in tables', async () => {
    const user = userEvent.setup();
    const parentClickHandler = vi.fn();
    const checkboxChangeHandler = vi.fn();

    render(
      <div onClick={parentClickHandler}>
        <Checkbox onChange={checkboxChangeHandler} />
      </div>,
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(checkboxChangeHandler).toHaveBeenCalledTimes(1);
    expect(parentClickHandler).not.toHaveBeenCalled();
  });
});
