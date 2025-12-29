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
    render(<Checkbox checked onCheckedChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-state', 'checked');
  });

  it('handles unchecked state', () => {
    render(<Checkbox checked={false} onCheckedChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-state', 'unchecked');
  });

  it('handles click events with onCheckedChange', async () => {
    const user = userEvent.setup();
    const handleCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={handleCheckedChange} />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(handleCheckedChange).toHaveBeenCalledWith(true);
  });

  it('handles click events with onChange', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Checkbox onChange={handleChange} />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith({ target: { checked: true } });
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const handleCheckedChange = vi.fn();
    render(<Checkbox disabled onCheckedChange={handleCheckedChange} />);
    const checkbox = screen.getByRole('checkbox');

    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(handleCheckedChange).not.toHaveBeenCalled();
  });

  it('handles indeterminate state', () => {
    render(<Checkbox indeterminate />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
  });

  it('renders check icon when checked', () => {
    const { container } = render(<Checkbox checked onCheckedChange={vi.fn()} />);
    const checkIcon = container.querySelector('svg');
    expect(checkIcon).toBeInTheDocument();
  });

  it('renders minus icon when indeterminate', () => {
    const { container } = render(<Checkbox indeterminate />);
    const minusIcon = container.querySelector('svg');
    expect(minusIcon).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Checkbox className="custom-checkbox" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('custom-checkbox');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Checkbox ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });

  it('supports defaultChecked', () => {
    render(<Checkbox defaultChecked />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-state', 'checked');
  });

  it('accepts name prop without error', () => {
    // Radix Checkbox accepts name for form submission
    expect(() => render(<Checkbox name="terms" />)).not.toThrow();
  });

  it('accepts value prop without error', () => {
    // Radix Checkbox accepts value for form submission
    expect(() => render(<Checkbox value="accepted" />)).not.toThrow();
  });

  it('stops click propagation to prevent double-toggle in tables', async () => {
    const user = userEvent.setup();
    const parentClickHandler = vi.fn();
    const checkboxChangeHandler = vi.fn();

    render(
      <div onClick={parentClickHandler}>
        <Checkbox onCheckedChange={checkboxChangeHandler} />
      </div>,
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(checkboxChangeHandler).toHaveBeenCalledTimes(1);
    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it('renders checkbox with indeterminate state when both indeterminate and checked are true', () => {
    const { container } = render(<Checkbox indeterminate checked />);
    const minusIcon = container.querySelector('svg');
    expect(minusIcon).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
  });

  it('calls both onCheckedChange and onChange when transitioning from indeterminate to checked', async () => {
    const user = userEvent.setup();
    const handleCheckedChange = vi.fn();
    const handleChange = vi.fn();
    render(
      <Checkbox indeterminate onCheckedChange={handleCheckedChange} onChange={handleChange} />,
    );
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);

    expect(handleCheckedChange).toHaveBeenCalledTimes(1);
    expect(handleCheckedChange).toHaveBeenCalledWith(true);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith({ target: { checked: true } });

    expect(handleCheckedChange.mock.invocationCallOrder[0]).toBeLessThan(
      handleChange.mock.invocationCallOrder[0],
    );
  });

  it('renders in unchecked state with no icon when checked=false and indeterminate=false', () => {
    const { container } = render(<Checkbox checked={false} indeterminate={false} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    const icon = container.querySelector('svg');
    expect(icon).toBeNull();
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Checkbox disabled onClick={handleClick} />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('calls both onClick and onCheckedChange when clicked', async () => {
    const user = userEvent.setup();
    const onClickHandler = vi.fn();
    const onCheckedChangeHandler = vi.fn();

    render(<Checkbox onClick={onClickHandler} onCheckedChange={onCheckedChangeHandler} />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);

    expect(onClickHandler).toHaveBeenCalledTimes(1);
    expect(onCheckedChangeHandler).toHaveBeenCalledTimes(1);
  });

  it('calls onClick prop when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Checkbox onClick={handleClick} />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
