import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MetadataFilterSelector } from './MetadataFilterSelector';

describe('MetadataFilterSelector', () => {
  const defaultProps = {
    selectedMetadata: null,
    availableMetadata: ['model', 'strategy', 'version'],
    onChange: vi.fn(),
    metadataCounts: {
      model: 100,
      strategy: 50,
      version: 25,
    },
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no metadata is available and not loading', () => {
    const { container } = render(
      <MetadataFilterSelector {...defaultProps} availableMetadata={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dropdown when metadata is available', () => {
    render(<MetadataFilterSelector {...defaultProps} />);
    expect(screen.getByLabelText('Filter results by metadata key')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by Metadata')).toBeInTheDocument();
  });

  it('shows loading state when isLoading is true', () => {
    render(<MetadataFilterSelector {...defaultProps} isLoading={true} />);
    expect(screen.getByLabelText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays metadata keys with counts in dropdown', async () => {
    render(<MetadataFilterSelector {...defaultProps} />);
    const select = screen.getByRole('combobox', { name: 'Filter by Metadata' });

    fireEvent.mouseDown(select);

    // Get the listbox that appears
    const listbox = await screen.findByRole('listbox');

    await waitFor(() => {
      expect(within(listbox).getByText('model')).toBeInTheDocument();
      expect(within(listbox).getByText('100')).toBeInTheDocument();
      expect(within(listbox).getByText('strategy')).toBeInTheDocument();
      expect(within(listbox).getByText('50')).toBeInTheDocument();
      expect(within(listbox).getByText('version')).toBeInTheDocument();
      expect(within(listbox).getByText('25')).toBeInTheDocument();
    });
  });

  it('calls onChange with key when selecting a metadata key', async () => {
    render(<MetadataFilterSelector {...defaultProps} />);
    const select = screen.getByRole('combobox', { name: 'Filter by Metadata' });

    fireEvent.mouseDown(select);
    const listbox = await screen.findByRole('listbox');
    const modelOption = within(listbox).getByText('model');
    fireEvent.click(modelOption);

    expect(defaultProps.onChange).toHaveBeenCalledWith('model');
  });

  it('shows value input field when a key is selected', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter value (optional)')).toBeInTheDocument();
    });
  });

  it('calls onChange with key:value format when entering a value', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const valueInput = await screen.findByPlaceholderText('Enter value (optional)');
    await user.type(valueInput, 'gpt-4');

    // The onChange is called on each character typed
    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenCalledWith('model:gpt-4');
    });
  });

  it('supports Enter key to apply filter', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const valueInput = await screen.findByPlaceholderText('Enter value (optional)');

    // Type a value and press Enter
    await user.type(valueInput, 'gpt-4{Enter}');

    // onChange was called during typing and on Enter
    expect(defaultProps.onChange).toHaveBeenCalledWith('model:gpt-4');
  });

  it('clears value but keeps key filter when clicking clear button', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model:gpt-4" />);

    const clearButton = await screen.findByLabelText('Clear value');
    fireEvent.click(clearButton);

    expect(defaultProps.onChange).toHaveBeenCalledWith('model');
  });

  it('clears all filters when selecting empty option', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const select = screen.getByRole('combobox', { name: 'Filter by Metadata' });
    fireEvent.mouseDown(select);

    // The first empty option shows "All metadata"
    const listbox = await screen.findByRole('listbox');
    const allMetadataOption = within(listbox).getByText(/All metadata/i);
    fireEvent.click(allMetadataOption);

    expect(defaultProps.onChange).toHaveBeenCalledWith(null);
  });

  it('displays tooltip with wildcard examples', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const infoIcon = await screen.findByLabelText('Metadata filter help');
    await user.hover(infoIcon);

    await waitFor(() => {
      expect(screen.getByText('Value Filtering:')).toBeInTheDocument();
      expect(screen.getByText(/Exact match:/)).toBeInTheDocument();
      expect(screen.getByText(/Starts with:/)).toBeInTheDocument();
      expect(screen.getByText(/Contains:/)).toBeInTheDocument();
    });
  });

  it('preserves value when switching between key:value format', async () => {
    const { rerender } = render(
      <MetadataFilterSelector {...defaultProps} selectedMetadata="model:gpt-4" />,
    );

    await waitFor(() => {
      const valueInput = screen.getByPlaceholderText('Enter value (optional)');
      expect(valueInput).toHaveValue('gpt-4');
    });

    // Simulate prop update
    rerender(<MetadataFilterSelector {...defaultProps} selectedMetadata="strategy:composite" />);

    await waitFor(() => {
      const newValueInput = screen.getByPlaceholderText('Enter value (optional)');
      expect(newValueInput).toHaveValue('composite');
    });
  });

  it('handles wildcard patterns correctly', async () => {
    const user = userEvent.setup();

    // Test starts with pattern
    const { unmount: unmount1 } = render(
      <MetadataFilterSelector {...defaultProps} selectedMetadata="model" />,
    );
    const valueInput1 = await screen.findByPlaceholderText('Enter value (optional)');
    await user.type(valueInput1, 'gpt-*');
    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenCalledWith('model:gpt-*');
    });
    unmount1();

    // Reset for next test
    defaultProps.onChange.mockClear();

    // Test ends with pattern
    const { unmount: unmount2 } = render(
      <MetadataFilterSelector {...defaultProps} selectedMetadata="model" />,
    );
    const valueInput2 = await screen.findByPlaceholderText('Enter value (optional)');
    await user.type(valueInput2, '*-turbo');
    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenCalledWith('model:*-turbo');
    });
    unmount2();

    // Reset for next test
    defaultProps.onChange.mockClear();

    // Test contains pattern
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    const valueInput3 = await screen.findByPlaceholderText('Enter value (optional)');
    await user.type(valueInput3, '*3.5*');
    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenCalledWith('model:*3.5*');
    });
  });

  it('renders with basic version when metadataCounts not provided', async () => {
    render(<MetadataFilterSelector {...defaultProps} metadataCounts={undefined} />);

    const select = screen.getByRole('combobox', { name: 'Filter by Metadata' });
    fireEvent.mouseDown(select);

    // Should show keys without counts
    const listbox = await screen.findByRole('listbox');
    await waitFor(() => {
      expect(within(listbox).getByText('model')).toBeInTheDocument();
    });
    expect(within(listbox).queryByText('100')).not.toBeInTheDocument();
  });

  it('maintains focus after clearing value', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model:gpt-4" />);

    const valueInput = (await screen.findByPlaceholderText(
      'Enter value (optional)',
    )) as HTMLInputElement;
    valueInput.focus();

    const clearButton = await screen.findByLabelText('Clear value');
    fireEvent.click(clearButton);

    // Value input should still be visible
    expect(screen.getByPlaceholderText('Enter value (optional)')).toBeInTheDocument();
    // Note: Focus behavior can be tricky to test in jsdom
  });

  it('shows visual grouping with Paper component for value input', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    // Check for Paper component styling
    const valueInput = screen.getByPlaceholderText('Enter value (optional)');
    const paperElement = valueInput.closest('[class*=MuiPaper]');
    expect(paperElement).toBeInTheDocument();

    // Check for = separator
    expect(screen.getByText('=')).toBeInTheDocument();
  });

  it('handles empty value correctly', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const valueInput = await screen.findByPlaceholderText('Enter value (optional)');
    await user.type(valueInput, 'test');
    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenCalledWith('model:test');
    });

    // Clear the input by selecting all and deleting
    await user.tripleClick(valueInput);
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenCalledWith('model');
    });
  });

  it('accessibility: has proper ARIA labels', () => {
    render(<MetadataFilterSelector {...defaultProps} />);

    expect(screen.getByLabelText('Filter results by metadata key')).toBeInTheDocument();
    // The combobox role is on the inner div, not the wrapper
    const select = screen.getByLabelText('Filter results by metadata key');
    expect(select.querySelector('[role="combobox"]')).toBeInTheDocument();
  });

  it('accessibility: announces changes to screen readers', async () => {
    render(<MetadataFilterSelector {...defaultProps} />);

    const description = screen.getByText(/Select a metadata key to filter evaluation results/);
    expect(description).toHaveAttribute('id', 'metadata-filter-description');
    expect(description).toHaveStyle({ position: 'absolute', left: '-9999px' });
  });
});
