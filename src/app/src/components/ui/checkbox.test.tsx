import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, CheckboxWithLabel } from './checkbox';
import { TooltipProvider } from './tooltip';

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
});

describe('CheckboxWithLabel', () => {
  it('renders with label', () => {
    render(<CheckboxWithLabel label="Accept terms" onChange={vi.fn()} />);

    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByText('Accept terms')).toBeInTheDocument();
  });

  it('handles checked state', () => {
    render(<CheckboxWithLabel label="Accept terms" checked onChange={vi.fn()} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('calls onChange with boolean when checkbox is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<CheckboxWithLabel label="Accept terms" onChange={handleChange} />);

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange when row is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<CheckboxWithLabel label="Accept terms" onChange={handleChange} />);

    // Click on the row container (not the checkbox)
    const label = screen.getByText('Accept terms');
    await user.click(label);

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const { container } = render(
      <CheckboxWithLabel label="Accept terms" disabled onChange={handleChange} />,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();

    // Try to click the wrapper
    const wrapper = container.firstChild;
    await user.click(wrapper as Element);

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies disabled styling', () => {
    const { container } = render(
      <CheckboxWithLabel label="Accept terms" disabled onChange={vi.fn()} />,
    );

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('opacity-50');
    expect(wrapper).toHaveClass('cursor-not-allowed');
  });

  it('renders tooltip icon when tooltipText is provided', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <CheckboxWithLabel
          label="Accept terms"
          tooltipText="You must accept the terms to continue"
          onChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    // Should have an info icon
    const infoIcon = document.querySelector('svg.lucide-info');
    expect(infoIcon).toBeInTheDocument();

    // Hover to show tooltip
    await user.hover(infoIcon!);

    // Wait for tooltip to appear
    const tooltipTexts = await screen.findAllByText('You must accept the terms to continue');
    expect(tooltipTexts.length).toBeGreaterThan(0);
  });

  it('applies custom className', () => {
    const { container } = render(
      <CheckboxWithLabel label="Accept terms" className="custom-checkbox" onChange={vi.fn()} />,
    );

    expect(container.firstChild).toHaveClass('custom-checkbox');
  });
});
