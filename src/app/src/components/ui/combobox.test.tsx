import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, ComboboxMultiple, type ComboboxOption } from './combobox';

const mockOptions: ComboboxOption[] = [
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'angular', label: 'Angular' },
  { value: 'svelte', label: 'Svelte' },
];

describe('Combobox', () => {
  it('renders with placeholder', () => {
    render(<Combobox options={mockOptions} placeholder="Select framework..." />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Select framework...')).toBeInTheDocument();
  });

  it('displays selected value', () => {
    render(<Combobox options={mockOptions} value="react" />);

    expect(screen.getByText('React')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Vue')).toBeInTheDocument();
  });

  it('calls onValueChange when option is selected', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(<Combobox options={mockOptions} onValueChange={handleValueChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Vue'));

    expect(handleValueChange).toHaveBeenCalledWith('vue');
  });

  it('closes dropdown after selection', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByText('React'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters options based on search input', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} />);

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Select...');
    await user.type(input, 'rea');

    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.queryByText('Vue')).not.toBeInTheDocument();
  });

  it('shows empty message when no options match', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} emptyText="No frameworks found" />);

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Select...');
    await user.type(input, 'xyz');

    expect(screen.getByText('No frameworks found')).toBeInTheDocument();
  });

  it('supports disabled state', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} disabled />);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeDisabled();

    await user.click(combobox);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clears value when clear button is clicked', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(<Combobox options={mockOptions} value="react" onValueChange={handleValueChange} />);

    // Find the clear button (X icon)
    const clearButton = screen.getByRole('button', { hidden: true });
    await user.click(clearButton);

    expect(handleValueChange).toHaveBeenCalledWith('');
  });

  it('hides clear button when clearable is false', () => {
    render(<Combobox options={mockOptions} value="react" clearable={false} />);

    // There should be no X button visible
    const combobox = screen.getByRole('combobox');
    expect(within(combobox).queryByRole('button', { hidden: true })).not.toBeInTheDocument();
  });

  it('supports small size variant', () => {
    render(<Combobox options={mockOptions} size="sm" />);

    expect(screen.getByRole('combobox')).toHaveClass('h-8');
  });

  it('supports default size variant', () => {
    render(<Combobox options={mockOptions} size="default" />);

    expect(screen.getByRole('combobox')).toHaveClass('h-10');
  });

  it('shows loading state', async () => {
    const user = userEvent.setup();
    render(<Combobox options={[]} loading loadingText="Fetching options..." />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByText('Fetching options...')).toBeInTheDocument();
  });

  it('calls onInputChange when search input changes', async () => {
    const user = userEvent.setup();
    const handleInputChange = vi.fn();
    render(<Combobox options={mockOptions} onInputChange={handleInputChange} />);

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Select...');
    await user.type(input, 'test');

    expect(handleInputChange).toHaveBeenCalledWith('t');
    expect(handleInputChange).toHaveBeenCalledWith('te');
    expect(handleInputChange).toHaveBeenCalledWith('tes');
    expect(handleInputChange).toHaveBeenCalledWith('test');
  });

  it('supports freeSolo mode - allows custom input', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(<Combobox options={mockOptions} freeSolo onValueChange={handleValueChange} />);

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Select...');
    await user.type(input, 'Custom Value{Enter}');

    expect(handleValueChange).toHaveBeenCalledWith('Custom Value');
  });

  it('handles disabled options', async () => {
    const user = userEvent.setup();
    const optionsWithDisabled: ComboboxOption[] = [
      { value: 'react', label: 'React' },
      { value: 'vue', label: 'Vue', disabled: true },
    ];
    const handleValueChange = vi.fn();
    render(<Combobox options={optionsWithDisabled} onValueChange={handleValueChange} />);

    await user.click(screen.getByRole('combobox'));

    // The disabled option should have disabled styling
    const vueOption = screen.getByText('Vue');
    expect(vueOption.closest('[data-disabled]')).toBeInTheDocument();
  });

  it('shows check mark for selected option', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} value="react" />);

    await user.click(screen.getByRole('combobox'));

    // Find the option in the listbox (not the trigger button)
    const listbox = screen.getByRole('listbox');
    const reactOption = within(listbox).getByText('React').closest('[cmdk-item]');
    const checkIcon = reactOption?.querySelector('svg');
    expect(checkIcon).toHaveClass('opacity-100');
  });

  it('applies custom className', () => {
    render(<Combobox options={mockOptions} className="custom-combobox" />);

    expect(screen.getByRole('combobox')).toHaveClass('custom-combobox');
  });
});

describe('ComboboxMultiple', () => {
  it('renders with placeholder when no items selected', () => {
    render(<ComboboxMultiple options={mockOptions} value={[]} onValueChange={() => {}} />);

    expect(screen.getByText('Select...')).toBeInTheDocument();
  });

  it('displays selected items as badges', () => {
    render(
      <ComboboxMultiple
        options={mockOptions}
        value={['react', 'vue']}
        onValueChange={() => {}}
      />,
    );

    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Vue')).toBeInTheDocument();
  });

  it('adds item to selection when clicked', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(
      <ComboboxMultiple options={mockOptions} value={['react']} onValueChange={handleValueChange} />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Vue'));

    expect(handleValueChange).toHaveBeenCalledWith(['react', 'vue']);
  });

  it('removes item from selection when clicked again', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(
      <ComboboxMultiple
        options={mockOptions}
        value={['react', 'vue']}
        onValueChange={handleValueChange}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    // Find React option in the listbox, not the badge
    const listbox = screen.getByRole('listbox');
    await user.click(within(listbox).getByText('React'));

    expect(handleValueChange).toHaveBeenCalledWith(['vue']);
  });

  it('removes item when X button on badge is clicked', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(
      <ComboboxMultiple
        options={mockOptions}
        value={['react', 'vue']}
        onValueChange={handleValueChange}
      />,
    );

    // Find the X button inside the React badge
    const reactBadge = screen.getByText('React').closest('span');
    const removeButton = reactBadge?.querySelector('[role="button"]');
    await user.click(removeButton!);

    expect(handleValueChange).toHaveBeenCalledWith(['vue']);
  });

  it('respects maxItems limit', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(
      <ComboboxMultiple
        options={mockOptions}
        value={['react', 'vue']}
        onValueChange={handleValueChange}
        maxItems={2}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    // Angular option should be disabled when max is reached
    const angularOption = screen.getByText('Angular');
    expect(angularOption.closest('[data-disabled]')).toBeInTheDocument();
  });

  it('shows checkbox indicators for selected items', async () => {
    const user = userEvent.setup();
    render(
      <ComboboxMultiple options={mockOptions} value={['react']} onValueChange={() => {}} />,
    );

    await user.click(screen.getByRole('combobox'));

    // Find options in the listbox
    const listbox = screen.getByRole('listbox');
    const reactOption = within(listbox).getByText('React').closest('[cmdk-item]');
    const vueOption = within(listbox).getByText('Vue').closest('[cmdk-item]');

    // React should have a filled checkbox, Vue should not
    const reactCheckbox = reactOption?.querySelector('.bg-primary');
    const vueCheckbox = vueOption?.querySelector('.opacity-50');

    expect(reactCheckbox).toBeInTheDocument();
    expect(vueCheckbox).toBeInTheDocument();
  });

  it('removes last item on backspace when input is empty', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(
      <ComboboxMultiple
        options={mockOptions}
        value={['react', 'vue']}
        onValueChange={handleValueChange}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Select...');
    await user.type(input, '{Backspace}');

    expect(handleValueChange).toHaveBeenCalledWith(['react']);
  });

  it('supports freeSolo mode for multiple selection', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();
    render(
      <ComboboxMultiple
        options={mockOptions}
        value={['react']}
        onValueChange={handleValueChange}
        freeSolo
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Select...');
    await user.type(input, 'Custom{Enter}');

    expect(handleValueChange).toHaveBeenCalledWith(['react', 'Custom']);
  });

  it('shows loading state', async () => {
    const user = userEvent.setup();
    render(
      <ComboboxMultiple
        options={[]}
        value={[]}
        onValueChange={() => {}}
        loading
        loadingText="Loading options..."
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByText('Loading options...')).toBeInTheDocument();
  });

  it('supports disabled state', async () => {
    const user = userEvent.setup();
    render(
      <ComboboxMultiple options={mockOptions} value={['react']} onValueChange={() => {}} disabled />,
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeDisabled();

    await user.click(combobox);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not show remove buttons when disabled', () => {
    render(
      <ComboboxMultiple options={mockOptions} value={['react']} onValueChange={() => {}} disabled />,
    );

    const reactBadge = screen.getByText('React').closest('span');
    expect(reactBadge?.querySelector('[role="button"]')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <ComboboxMultiple
        options={mockOptions}
        value={[]}
        onValueChange={() => {}}
        className="custom-multi-combobox"
      />,
    );

    expect(screen.getByRole('combobox')).toHaveClass('custom-multi-combobox');
  });

  it('filters options based on search input', async () => {
    const user = userEvent.setup();
    render(<ComboboxMultiple options={mockOptions} value={[]} onValueChange={() => {}} />);

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Select...');
    await user.type(input, 'ang');

    expect(screen.getByText('Angular')).toBeInTheDocument();
    expect(screen.queryByText('React')).not.toBeInTheDocument();
  });
});

describe('Combobox accessibility', () => {
  it('has proper combobox role', () => {
    render(<Combobox options={mockOptions} />);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('sets aria-expanded based on dropdown state', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} />);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.click(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('supports keyboard navigation to open dropdown', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('focuses search input when dropdown opens', async () => {
    const user = userEvent.setup();
    render(<Combobox options={mockOptions} placeholder="Select..." />);

    await user.click(screen.getByRole('combobox'));

    const input = screen.getByPlaceholderText('Select...');
    expect(document.activeElement).toBe(input);
  });
});
