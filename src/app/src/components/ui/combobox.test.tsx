import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from './combobox';

afterEach(() => {
  vi.resetAllMocks();
});

const mockOptions: ComboboxOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
];

const mockOptionsWithDescriptions: ComboboxOption[] = [
  { value: 'apple', label: 'Apple', description: 'A red fruit' },
  { value: 'banana', label: 'Banana', description: 'A yellow fruit' },
];

describe('Combobox', () => {
  describe('rendering', () => {
    it('renders input element with combobox role', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);
      const input = screen.getByRole('combobox');
      expect(input).toBeInTheDocument();
    });

    it('renders with placeholder', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} placeholder="Select a fruit" />);
      const input = screen.getByPlaceholderText('Select a fruit');
      expect(input).toBeInTheDocument();
    });

    it('renders with default placeholder when not provided', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} className="custom-combobox" />);
      const input = screen.getByRole('combobox');
      expect(input).toHaveClass('custom-combobox');
    });

    it('renders chevron down icon', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);
      expect(screen.getByTestId('combobox-chevron')).toBeInTheDocument();
    });

    it('displays selected value in input', () => {
      render(<Combobox options={mockOptions} value="banana" onChange={vi.fn()} />);
      const input = screen.getByRole('combobox') as HTMLInputElement;
      expect(input.value).toBe('Banana');
    });
  });

  describe('disabled state', () => {
    it('respects disabled state', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} disabled />);
      const input = screen.getByRole('combobox');
      expect(input).toBeDisabled();
    });

    it('does not open dropdown when disabled', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} disabled />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('does not show clear button when disabled', () => {
      render(<Combobox options={mockOptions} value="apple" onChange={vi.fn()} disabled />);
      expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
    });
  });

  describe('dropdown behavior', () => {
    it('opens dropdown on input click', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('opens dropdown on input focus', async () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await act(async () => {
        input.focus();
      });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('shows all options when dropdown opens', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getAllByRole('option')).toHaveLength(4);
      });
    });

    it('displays options with descriptions', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptionsWithDescriptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('· A red fruit')).toBeInTheDocument();
        expect(screen.getByText('· A yellow fruit')).toBeInTheDocument();
      });
    });

    it('does not open dropdown when there are no options', async () => {
      const user = userEvent.setup();
      render(<Combobox options={[]} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('calls onChange when option is selected', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Combobox options={mockOptions} onChange={handleChange} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const option = screen.getByRole('option', { name: /banana/i });
      await user.click(option);

      expect(handleChange).toHaveBeenCalledWith('banana');
    });

    it('updates input value after selection', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      const { rerender } = render(<Combobox options={mockOptions} onChange={handleChange} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const option = screen.getByRole('option', { name: /banana/i });
      await user.click(option);

      // Simulate controlled component update
      rerender(<Combobox options={mockOptions} value="banana" onChange={handleChange} />);

      expect((input as HTMLInputElement).value).toBe('Banana');
    });

    it('closes dropdown after selection', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Combobox options={mockOptions} onChange={handleChange} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const option = screen.getByRole('option', { name: /banana/i });
      await user.click(option);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('shows check mark on selected option', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} value="banana" onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const selectedOption = screen.getByRole('option', { name: /banana/i });
      expect(selectedOption).toHaveAttribute('aria-selected', 'true');

      // Check for check icon within the selected option
      const checkIcon = selectedOption.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('filters options based on input', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'ban');

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(1);
        expect(screen.getByRole('option', { name: /banana/i })).toBeInTheDocument();
      });
    });

    it('shows empty message when no options match filter', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} emptyMessage="No fruits found" />);

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'xyz');

      await waitFor(() => {
        expect(screen.getByText('No fruits found')).toBeInTheDocument();
      });
    });

    it('shows default empty message when not provided', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'xyz');

      await waitFor(() => {
        expect(screen.getByText('No results found.')).toBeInTheDocument();
      });
    });

    it('filtering is case insensitive', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'BAN');

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /banana/i })).toBeInTheDocument();
      });
    });

    it('clears selection when input is cleared', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Combobox options={mockOptions} value="banana" onChange={handleChange} />);

      const input = screen.getByRole('combobox');
      await user.clear(input);

      expect(handleChange).toHaveBeenCalledWith('');
    });
  });

  describe('clear button', () => {
    it('shows clear button when value is selected', () => {
      render(<Combobox options={mockOptions} value="apple" onChange={vi.fn()} />);
      expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
    });

    it('does not show clear button when no value is selected', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);
      expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
    });

    it('clears selection when clear button is clicked', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Combobox options={mockOptions} value="apple" onChange={handleChange} />);

      const clearButton = screen.getByLabelText('Clear selection');
      await user.click(clearButton);

      expect(handleChange).toHaveBeenCalledWith('');
    });

    it('focuses input after clearing', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Combobox options={mockOptions} value="apple" onChange={handleChange} />);

      const clearButton = screen.getByLabelText('Clear selection');
      await user.click(clearButton);

      const input = screen.getByRole('combobox');
      expect(input).toHaveFocus();
    });

    it('does not show clear button when clearable is false', () => {
      render(<Combobox options={mockOptions} value="apple" onChange={vi.fn()} clearable={false} />);
      expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
    });

    it('shows clear button by default (clearable=true)', () => {
      render(<Combobox options={mockOptions} value="apple" onChange={vi.fn()} />);
      expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
    });
  });

  describe('label prop', () => {
    it('renders label when provided', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} label="Select a fruit" />);
      expect(screen.getByText('Select a fruit')).toBeInTheDocument();
    });

    it('does not render label when not provided', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);
      expect(screen.queryByText('Select a fruit')).not.toBeInTheDocument();
    });

    it('label is associated with input via htmlFor', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} label="Select a fruit" />);
      const label = screen.getByText('Select a fruit');
      const input = screen.getByRole('combobox');
      expect(label).toHaveAttribute('for', input.id);
    });
  });

  describe('keyboard navigation', () => {
    it('opens dropdown on ArrowDown key', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      input.focus();
      await user.keyboard('{ArrowDown}');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('opens dropdown on ArrowUp key', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      input.focus();
      await user.keyboard('{ArrowUp}');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('navigates through options with ArrowDown', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');

      // Second option should be highlighted (index 1)
      const options = screen.getAllByRole('option');
      expect(options[1]).toHaveAttribute('data-highlighted');
    });

    it('navigates through options with ArrowUp', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Navigate down first, then up
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('data-highlighted');
    });

    it('selects highlighted option on Enter', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Combobox options={mockOptions} onChange={handleChange} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(handleChange).toHaveBeenCalledWith('apple');
    });

    it('closes dropdown on Escape', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('restores selected value on Escape', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} value="banana" onChange={vi.fn()} />);

      const input = screen.getByRole('combobox') as HTMLInputElement;
      await user.click(input);
      await user.clear(input);
      await user.type(input, 'app');

      expect(input.value).toBe('app');

      await user.keyboard('{Escape}');

      expect(input.value).toBe('Banana');
    });

    it('does not navigate past first option with ArrowUp', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');
      await user.keyboard('{ArrowUp}'); // Should not go below 0

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('data-highlighted');
    });

    it('does not navigate past last option with ArrowDown', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Navigate past the end
      for (let i = 0; i < 10; i++) {
        await user.keyboard('{ArrowDown}');
      }

      const options = screen.getAllByRole('option');
      expect(options[3]).toHaveAttribute('data-highlighted'); // Last option (index 3)
    });
  });

  describe('blur behavior', () => {
    it('closes dropdown on blur', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Combobox options={mockOptions} onChange={vi.fn()} />
          <button>Other element</button>
        </div>,
      );

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Other element'));

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('auto-selects matching option on blur', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <div>
          <Combobox options={mockOptions} onChange={handleChange} />
          <button>Other element</button>
        </div>,
      );

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'Apple');
      await user.click(screen.getByText('Other element'));

      expect(handleChange).toHaveBeenCalledWith('apple');
    });

    it('restores selected value on blur with non-matching input', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <div>
          <Combobox options={mockOptions} value="banana" onChange={handleChange} />
          <button>Other element</button>
        </div>,
      );

      const input = screen.getByRole('combobox') as HTMLInputElement;
      await user.click(input);
      await user.clear(input);
      await user.type(input, 'xyz');
      await user.click(screen.getByText('Other element'));

      await waitFor(() => {
        expect(input.value).toBe('Banana');
      });
    });

    it('clears input on blur with no selection and non-matching input', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <div>
          <Combobox options={mockOptions} onChange={handleChange} />
          <button>Other element</button>
        </div>,
      );

      const input = screen.getByRole('combobox') as HTMLInputElement;
      await user.click(input);
      await user.type(input, 'xyz');
      await user.click(screen.getByText('Other element'));

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });
  });

  describe('mouse interaction', () => {
    it('highlights option on mouse enter', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const option = screen.getByRole('option', { name: /cherry/i });
      await user.hover(option);

      expect(option).toHaveAttribute('data-highlighted');
    });
  });

  describe('accessibility', () => {
    it('has proper aria attributes on input', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);
      const input = screen.getByRole('combobox');

      expect(input).toHaveAttribute('aria-haspopup', 'listbox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('updates aria-expanded when dropdown opens/closes', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      await user.click(input);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('options have proper role and aria-selected', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} value="banana" onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(4);

        const selectedOption = screen.getByRole('option', { name: /banana/i });
        expect(selectedOption).toHaveAttribute('aria-selected', 'true');

        const unselectedOption = screen.getByRole('option', { name: /apple/i });
        expect(unselectedOption).toHaveAttribute('aria-selected', 'false');
      });
    });

    it('clear button has accessible label', () => {
      render(<Combobox options={mockOptions} value="apple" onChange={vi.fn()} />);
      const clearButton = screen.getByLabelText('Clear selection');
      expect(clearButton).toBeInTheDocument();
    });
  });

  describe('controlled value updates', () => {
    it('updates input when value prop changes', () => {
      const { rerender } = render(
        <Combobox options={mockOptions} value="apple" onChange={vi.fn()} />,
      );

      const input = screen.getByRole('combobox') as HTMLInputElement;
      expect(input.value).toBe('Apple');

      rerender(<Combobox options={mockOptions} value="banana" onChange={vi.fn()} />);
      expect(input.value).toBe('Banana');
    });

    it('clears input when value is removed', () => {
      const { rerender } = render(
        <Combobox options={mockOptions} value="apple" onChange={vi.fn()} />,
      );

      const input = screen.getByRole('combobox') as HTMLInputElement;
      expect(input.value).toBe('Apple');

      rerender(<Combobox options={mockOptions} value="" onChange={vi.fn()} />);
      expect(input.value).toBe('');
    });
  });

  describe('chevron button interaction', () => {
    it('toggles dropdown when chevron is clicked', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const chevron = screen.getByTestId('combobox-chevron');

      // Click to open
      await user.click(chevron);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Click to close
      await user.click(chevron);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('focuses input when chevron is clicked', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const chevron = screen.getByTestId('combobox-chevron');
      const input = screen.getByRole('combobox');

      await user.click(chevron);

      expect(input).toHaveFocus();
    });

    it('does not toggle dropdown when chevron is clicked and disabled', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} disabled />);

      const chevron = screen.getByTestId('combobox-chevron');

      await user.click(chevron);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('has proper aria-label on chevron button', () => {
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);
      const chevron = screen.getByTestId('combobox-chevron');
      expect(chevron).toHaveAttribute('aria-label', 'Open dropdown');
    });

    it('updates aria-label when dropdown is open', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const chevron = screen.getByTestId('combobox-chevron');
      expect(chevron).toHaveAttribute('aria-label', 'Close dropdown');
    });

    it('prevents default behavior on chevron mousedown', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const chevron = screen.getByTestId('combobox-chevron');
      const input = screen.getByRole('combobox');

      // Focus the input first
      input.focus();

      // MouseDown on chevron should not blur the input
      await user.pointer({ keys: '[MouseLeft>]', target: chevron });

      expect(input).toHaveFocus();
    });

    it('does not close dropdown when clicking chevron while input is blurred', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Combobox options={mockOptions} onChange={vi.fn()} />
          <button>Other element</button>
        </div>,
      );

      const input = screen.getByRole('combobox');
      const chevron = screen.getByTestId('combobox-chevron');

      // Open dropdown via input
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Click other element to blur input
      await user.click(screen.getByText('Other element'));

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      // Now clicking chevron should reopen
      await user.click(chevron);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });
  });

  describe('input blur with chevron interaction', () => {
    it('does not close dropdown when focus moves to chevron', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');

      // Open dropdown
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Tab to chevron (simulating blur to chevron)
      await user.tab();

      // Dropdown should remain open
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });
  });

  describe('interact outside with chevron', () => {
    it('does not close dropdown when clicking chevron from outside', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      const chevron = screen.getByTestId('combobox-chevron');

      // Open dropdown
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Click chevron (this is technically an "outside" interaction from popover's perspective)
      await user.click(chevron);

      // Should toggle closed
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('prevents closing when chevron is clicked during interact outside', async () => {
      const user = userEvent.setup();
      render(<Combobox options={mockOptions} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox');
      const chevron = screen.getByTestId('combobox-chevron');

      // Open dropdown
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Clicking chevron should toggle it closed via handleChevronClick, not via onInteractOutside
      // This tests that onInteractOutside properly prevents its default behavior
      await user.click(chevron);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      // Click chevron again to reopen
      await user.click(chevron);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });
  });
});
