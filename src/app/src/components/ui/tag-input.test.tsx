import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagInput } from './tag-input';

const suggestions = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese'];

describe('TagInput', () => {
  describe('rendering', () => {
    it('renders with placeholder when empty', () => {
      render(<TagInput value={[]} onChange={vi.fn()} placeholder="Add a language" />);
      expect(screen.getByPlaceholderText('Add a language')).toBeInTheDocument();
    });

    it('renders selected values as badges', () => {
      render(<TagInput value={['English', 'Spanish']} onChange={vi.fn()} />);
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('Spanish')).toBeInTheDocument();
    });

    it('hides placeholder when values are selected', () => {
      render(<TagInput value={['English']} onChange={vi.fn()} placeholder="Add a language" />);
      expect(screen.queryByPlaceholderText('Add a language')).not.toBeInTheDocument();
    });

    it('renders remove buttons for each badge', () => {
      render(<TagInput value={['English', 'Spanish']} onChange={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Remove English' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Spanish' })).toBeInTheDocument();
    });

    it('applies disabled state', () => {
      render(<TagInput value={['English']} onChange={vi.fn()} disabled />);
      expect(screen.getByRole('combobox')).toBeDisabled();
      // Remove buttons should not be present when disabled
      expect(screen.queryByRole('button', { name: 'Remove English' })).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <TagInput value={[]} onChange={vi.fn()} className="custom-class" />,
      );
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('adding values', () => {
    it('adds value on Enter key', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'English{Enter}');

      expect(onChange).toHaveBeenCalledWith(['English']);
    });

    it('adds value from suggestions on click', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={[]} onChange={onChange} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('option', { name: 'English' }));
      expect(onChange).toHaveBeenCalledWith(['English']);
    });

    it('filters suggestions as user types', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'Spa');

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Spanish' })).toBeInTheDocument();
      });
      expect(screen.queryByRole('option', { name: 'English' })).not.toBeInTheDocument();
    });

    it('excludes already selected values from suggestions', async () => {
      const user = userEvent.setup();
      render(<TagInput value={['English']} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
      expect(screen.queryByRole('option', { name: 'English' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Spanish' })).toBeInTheDocument();
    });

    it('does not add duplicate values', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={['English']} onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'English{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('uses normalizeValue function when adding', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const normalizeValue = vi.fn((val: string) => val.toUpperCase());

      render(<TagInput value={[]} onChange={onChange} normalizeValue={normalizeValue} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'english{Enter}');

      expect(normalizeValue).toHaveBeenCalledWith('english');
      expect(onChange).toHaveBeenCalledWith(['ENGLISH']);
    });

    it('does not add value if normalizeValue returns null', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const normalizeValue = vi.fn(() => null);

      render(<TagInput value={[]} onChange={onChange} normalizeValue={normalizeValue} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'invalid{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('clears input after adding value', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} />);

      const input = screen.getByRole('combobox') as HTMLInputElement;
      await user.type(input, 'English{Enter}');

      expect(input.value).toBe('');
    });
  });

  describe('removing values', () => {
    it('removes value when clicking remove button', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={['English', 'Spanish']} onChange={onChange} />);

      await user.click(screen.getByRole('button', { name: 'Remove English' }));

      expect(onChange).toHaveBeenCalledWith(['Spanish']);
    });

    it('removes last value on Backspace when input is empty', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={['English', 'Spanish']} onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{Backspace}');

      expect(onChange).toHaveBeenCalledWith(['English']);
    });

    it('does not remove value on Backspace when input has text', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={['English']} onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'test');
      await user.keyboard('{Backspace}');

      // Should only have been called if we added something, not for backspace
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it('opens suggestions on ArrowDown', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('navigates suggestions with ArrowDown/ArrowUp', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('option', { name: 'Spanish' })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('selects highlighted suggestion on Enter', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={[]} onChange={onChange} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

      expect(onChange).toHaveBeenCalledWith(['Spanish']);
    });

    it('closes suggestions on Escape', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

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

    it('selects highlighted suggestion on Tab', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<TagInput value={[]} onChange={onChange} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}{Tab}');

      expect(onChange).toHaveBeenCalledWith(['English']);
    });
  });

  describe('suggestions dropdown', () => {
    it('shows suggestions on focus', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('handles large suggestion lists', async () => {
      const user = userEvent.setup();
      const manySuggestions = Array.from({ length: 100 }, (_, i) => `Language ${i}`);
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={manySuggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // All suggestions should be rendered (scrollable)
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(100);
    });

    it('shows all available suggestions when input is empty', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // All suggestions should be visible
      suggestions.forEach((suggestion) => {
        expect(screen.getByRole('option', { name: suggestion })).toBeInTheDocument();
      });
    });

    it('does not show dropdown when no suggestions match', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'xyz');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('has correct ARIA attributes on combobox', async () => {
      const user = userEvent.setup();
      render(
        <TagInput
          value={[]}
          onChange={vi.fn()}
          suggestions={suggestions}
          aria-label="Select languages"
        />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-haspopup', 'listbox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
      expect(input).toHaveAttribute('aria-label', 'Select languages');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      await user.click(input);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(input).toHaveAttribute('aria-controls', 'tag-input-listbox');
      });
    });

    it('updates aria-activedescendant when navigating', async () => {
      const user = userEvent.setup();
      render(<TagInput value={[]} onChange={vi.fn()} suggestions={suggestions} />);

      const input = screen.getByRole('combobox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute('aria-activedescendant', 'tag-input-option-0');

      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute('aria-activedescendant', 'tag-input-option-1');
    });
  });
});
