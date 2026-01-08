import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

describe('Select', () => {
  it('renders select trigger', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
      </Select>,
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Select option')).toBeInTheDocument();
  });

  it('opens dropdown on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    expect(
      await screen.findByRole('option', { name: 'Option 1' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 2' })).toBeInTheDocument();
  });

  it('selects item on click', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Select onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const option1 = await screen.findByRole('option', { name: 'Option 1' }, { timeout: 3000 });
    await user.click(option1);

    expect(handleChange).toHaveBeenCalledWith('option1');
  });

  it('displays selected value', async () => {
    userEvent.setup();
    render(
      <Select defaultValue="option1">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();
  });

  it('supports disabled state', () => {
    render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('data-disabled', '');
  });

  it('applies custom className to trigger', () => {
    render(
      <Select>
        <SelectTrigger className="custom-trigger">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('custom-trigger');
  });

  it('shows chevron down icon', () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('supports disabled items', async () => {
    const user = userEvent.setup();
    render(
      <Select>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2" disabled>
            Option 2 (disabled)
          </SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const disabledOption = await screen.findByRole(
      'option',
      { name: 'Option 2 (disabled)' },
      { timeout: 3000 },
    );
    expect(disabledOption).toHaveAttribute('data-disabled', '');
  });

  it('correctly spreads props to SelectPrimitive.Trigger', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Select>
        <SelectTrigger
          data-custom-attribute="custom-value"
          aria-label="custom-label"
          onClick={onClick}
        >
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('data-custom-attribute', 'custom-value');
    expect(trigger).toHaveAttribute('aria-label', 'custom-label');

    await user.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('correctly forwards the ref to the SelectPrimitive.Trigger', () => {
    const ref = vi.fn();
    render(
      <Select>
        <SelectTrigger ref={ref}>
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
      </Select>,
    );

    expect(ref).toHaveBeenCalled();
    const triggerElement = ref.mock.calls[0][0];
    expect(triggerElement).toBeInstanceOf(HTMLButtonElement);
    expect(triggerElement).toEqual(screen.getByRole('combobox'));
  });

  it('renders select trigger with default size when size prop is not provided', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('h-10');
    expect(trigger).toHaveClass('px-3');
    expect(trigger).toHaveClass('py-2');
    expect(trigger).toHaveClass('text-sm');
  });

  it('applies custom className and size variant classes to trigger', () => {
    render(
      <Select>
        <SelectTrigger className="custom-trigger" size="sm">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('custom-trigger');
    expect(trigger).toHaveClass('h-8');
    expect(trigger).toHaveClass('px-2');
    expect(trigger).toHaveClass('py-1');
    expect(trigger).toHaveClass('text-xs');
  });

  it.each([
    { size: 'sm', expectedClass: 'h-8 px-2 py-1 text-xs' },
    { size: 'default', expectedClass: 'h-10 px-3 py-2 text-sm' },
    { size: 'lg', expectedClass: 'h-12 px-4 py-3 text-base' },
  ])('renders SelectTrigger with size="$size"', ({ size, expectedClass }) => {
    render(
      <Select>
        <SelectTrigger size={size as 'sm' | 'default' | 'lg'}>
          <SelectValue placeholder={`Select option ${size}`} />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass(expectedClass);
  });

  it('merges custom className with size variant classes, custom className takes precedence', () => {
    render(
      <Select>
        <SelectTrigger className="h-6 w-[70px]">
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('h-6');
    expect(trigger).toHaveClass('w-[70px]');
  });

  it('merges size variant and custom className', () => {
    render(
      <Select>
        <SelectTrigger size="sm" className="custom-class">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('h-8');
    expect(trigger).toHaveClass('px-2');
    expect(trigger).toHaveClass('py-1');
    expect(trigger).toHaveClass('text-xs');
    expect(trigger).toHaveClass('custom-class');
  });
});
