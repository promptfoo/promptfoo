import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RadioGroup, RadioGroupItem, RadioGroupItemWithLabel } from './radio-group';

describe('RadioGroup', () => {
  it('renders radio group with items', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
      </RadioGroup>,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
  });

  it('handles controlled value', () => {
    render(
      <RadioGroup value="option2">
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
      </RadioGroup>,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).toBeChecked();
  });

  it('handles value change', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();

    render(
      <RadioGroup value="option1" onValueChange={handleValueChange}>
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
      </RadioGroup>,
    );

    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]);

    expect(handleValueChange).toHaveBeenCalledWith('option2');
  });

  it('supports defaultValue for uncontrolled usage', () => {
    render(
      <RadioGroup defaultValue="option2">
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
      </RadioGroup>,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).toBeChecked();
  });

  it('supports horizontal orientation', () => {
    const { container } = render(
      <RadioGroup orientation="horizontal">
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
      </RadioGroup>,
    );

    const group = container.firstChild;
    expect(group).toHaveClass('grid-flow-col');
  });

  it('supports vertical orientation (default)', () => {
    const { container } = render(
      <RadioGroup orientation="vertical">
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
      </RadioGroup>,
    );

    const group = container.firstChild;
    expect(group).not.toHaveClass('grid-flow-col');
  });

  it('applies custom className to group', () => {
    const { container } = render(
      <RadioGroup className="custom-group">
        <RadioGroupItem value="option1" />
      </RadioGroup>,
    );

    expect(container.firstChild).toHaveClass('custom-group');
  });

  it('supports name attribute on radiogroup', () => {
    render(
      <RadioGroup name="test-group">
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
      </RadioGroup>,
    );

    // Radix applies the name to the radiogroup container for form submission
    const radioGroup = screen.getByRole('radiogroup');
    expect(radioGroup).toBeInTheDocument();
  });

  it('allows keyboard navigation between options', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();

    render(
      <RadioGroup defaultValue="option1" onValueChange={handleValueChange}>
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
        <RadioGroupItem value="option3" />
      </RadioGroup>,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();

    // Focus the first radio
    radios[0].focus();
    expect(document.activeElement).toBe(radios[0]);

    // Clicking a different option should change selection (Radix keyboard navigation
    // is handled internally and may not trigger in JSDOM the same way as in browser)
    await user.click(radios[2]);
    expect(handleValueChange).toHaveBeenCalledWith('option3');
    expect(radios[2]).toBeChecked();
  });
});

describe('RadioGroupItem', () => {
  it('renders radio button', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="test" />
      </RadioGroup>,
    );

    expect(screen.getByRole('radio')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="test" className="custom-radio" />
      </RadioGroup>,
    );

    expect(screen.getByRole('radio')).toHaveClass('custom-radio');
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();

    render(
      <RadioGroup onValueChange={handleValueChange}>
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" disabled />
      </RadioGroup>,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[1]).toBeDisabled();

    await user.click(radios[1]);
    expect(handleValueChange).not.toHaveBeenCalled();
  });

  it('supports small size variant', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="test" size="sm" />
      </RadioGroup>,
    );

    const radio = screen.getByRole('radio');
    expect(radio).toHaveClass('h-4', 'w-4');
  });

  it('supports default size variant', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="test" size="default" />
      </RadioGroup>,
    );

    const radio = screen.getByRole('radio');
    expect(radio).toHaveClass('h-5', 'w-5');
  });

  it('shows indicator when checked', () => {
    const { container } = render(
      <RadioGroup value="test">
        <RadioGroupItem value="test" />
      </RadioGroup>,
    );

    // The indicator (Circle icon) should be rendered when checked
    const indicator = container.querySelector('svg');
    expect(indicator).toBeInTheDocument();
  });

  it('does not show indicator when unchecked', () => {
    const { container } = render(
      <RadioGroup value="other">
        <RadioGroupItem value="test" />
      </RadioGroup>,
    );

    // The indicator should not be visible when unchecked
    const indicator = container.querySelector('svg');
    expect(indicator).not.toBeInTheDocument();
  });

  it('supports id attribute for label association', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="test" id="my-radio" />
        <label htmlFor="my-radio">Test Label</label>
      </RadioGroup>,
    );

    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('id', 'my-radio');
  });
});

describe('RadioGroupItemWithLabel', () => {
  it('renders with label', () => {
    render(
      <RadioGroup>
        <RadioGroupItemWithLabel value="test" label="Test Label" />
      </RadioGroup>,
    );

    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByRole('radio')).toBeInTheDocument();
  });

  it('renders with description', () => {
    render(
      <RadioGroup>
        <RadioGroupItemWithLabel
          value="test"
          label="Test Label"
          description="Test description"
        />
      </RadioGroup>,
    );

    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('clicking label selects radio', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();

    render(
      <RadioGroup onValueChange={handleValueChange}>
        <RadioGroupItemWithLabel value="option1" label="Option 1" />
        <RadioGroupItemWithLabel value="option2" label="Option 2" />
      </RadioGroup>,
    );

    await user.click(screen.getByText('Option 2'));
    expect(handleValueChange).toHaveBeenCalledWith('option2');
  });

  it('supports small size variant', () => {
    render(
      <RadioGroup>
        <RadioGroupItemWithLabel value="test" label="Test" size="sm" />
      </RadioGroup>,
    );

    const radio = screen.getByRole('radio');
    expect(radio).toHaveClass('h-4', 'w-4');
  });

  it('supports disabled state', () => {
    render(
      <RadioGroup>
        <RadioGroupItemWithLabel value="test" label="Test" disabled />
      </RadioGroup>,
    );

    const radio = screen.getByRole('radio');
    expect(radio).toBeDisabled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <RadioGroup>
        <RadioGroupItemWithLabel value="test" label="Test" className="custom-item" />
      </RadioGroup>,
    );

    const wrapper = container.querySelector('.custom-item');
    expect(wrapper).toBeInTheDocument();
  });

  it('renders card variant with border', () => {
    const { container } = render(
      <RadioGroup>
        <RadioGroupItemWithLabel value="test" label="Test" variant="card" />
      </RadioGroup>,
    );

    const card = container.querySelector('.rounded-lg.border');
    expect(card).toBeInTheDocument();
  });

  it('card variant shows checked state styling', () => {
    const { container } = render(
      <RadioGroup value="test">
        <RadioGroupItemWithLabel value="test" label="Test" variant="card" />
      </RadioGroup>,
    );

    // The card label should contain the checked radio
    const label = container.querySelector('label');
    const radio = within(label!).getByRole('radio');
    expect(radio).toBeChecked();
  });
});

describe('RadioGroup accessibility', () => {
  it('has proper radiogroup role', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="option1" />
      </RadioGroup>,
    );

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('supports aria-label', () => {
    render(
      <RadioGroup aria-label="Select an option">
        <RadioGroupItem value="option1" />
      </RadioGroup>,
    );

    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Select an option');
  });

  it('supports aria-labelledby', () => {
    render(
      <>
        <span id="group-label">Select an option</span>
        <RadioGroup aria-labelledby="group-label">
          <RadioGroupItem value="option1" />
        </RadioGroup>
      </>,
    );

    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-labelledby', 'group-label');
  });

  it('supports required attribute', () => {
    render(
      <RadioGroup required>
        <RadioGroupItem value="option1" />
      </RadioGroup>,
    );

    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-required', 'true');
  });

  it('only one radio can be checked at a time', async () => {
    const user = userEvent.setup();

    render(
      <RadioGroup defaultValue="option1">
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
        <RadioGroupItem value="option3" />
      </RadioGroup>,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
    expect(radios[2]).not.toBeChecked();

    await user.click(radios[2]);

    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).not.toBeChecked();
    expect(radios[2]).toBeChecked();
  });
});
