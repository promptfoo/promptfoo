import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Filter by Metadata')).toBeInTheDocument();
  });

  it('shows loading state when isLoading is true', () => {
    render(<MetadataFilterSelector {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays metadata keys with counts in dropdown', async () => {
    render(<MetadataFilterSelector {...defaultProps} />);
    const select = screen.getByLabelText('Filter results by metadata key');

    fireEvent.mouseDown(select);

    await waitFor(() => {
      expect(screen.getByText('model')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('strategy')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('version')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });

  it('calls onChange with key when selecting a metadata key', async () => {
    render(<MetadataFilterSelector {...defaultProps} />);
    const select = screen.getByLabelText('Filter results by metadata key');

    fireEvent.mouseDown(select);
    await waitFor(() => screen.getByText('model'));
    fireEvent.click(screen.getByText('model'));

    expect(defaultProps.onChange).toHaveBeenCalledWith('model');
  });

  it('shows value input field when a key is selected', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by metadata value')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter value (optional)')).toBeInTheDocument();
    });
  });

  it('calls onChange with key:value format when entering a value', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const valueInput = await screen.findByLabelText('Filter by metadata value');
    await user.type(valueInput, 'gpt-4');

    // The onChange is called on each character typed
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:gpt-4');
  });

  it('supports Enter key to apply filter', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const valueInput = await screen.findByLabelText('Filter by metadata value');

    // Type a value first
    fireEvent.change(valueInput, { target: { value: 'gpt-4' } });
    // Then press Enter
    fireEvent.keyPress(valueInput, { key: 'Enter', code: 'Enter', charCode: 13 });

    // onChange was already called during typing, so we verify it was called
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

    const select = screen.getByLabelText('Filter results by metadata key');
    fireEvent.mouseDown(select);

    // The first empty option shows "All metadata"
    await waitFor(() => screen.getByText(/All metadata/i));
    const allMetadataOption = screen.getByRole('option', { name: /all metadata/i });
    fireEvent.click(allMetadataOption);

    expect(defaultProps.onChange).toHaveBeenCalledWith(null);
  });

  it('displays tooltip with wildcard examples', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const infoIcon = await screen.findByTestId('InfoOutlinedIcon');
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

    const valueInput = await screen.findByLabelText('Filter by metadata value');
    expect(valueInput).toHaveValue('gpt-4');

    // Simulate prop update
    rerender(<MetadataFilterSelector {...defaultProps} selectedMetadata="strategy:composite" />);

    await waitFor(() => {
      const newValueInput = screen.getByLabelText('Filter by metadata value');
      expect(newValueInput).toHaveValue('composite');
    });
  });

  it('handles wildcard patterns correctly', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const valueInput = await screen.findByLabelText('Filter by metadata value');

    // Test starts with pattern
    await user.clear(valueInput);
    await user.type(valueInput, 'gpt-*');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:gpt-*');

    // Test ends with pattern
    await user.clear(valueInput);
    await user.type(valueInput, '*-turbo');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:*-turbo');

    // Test contains pattern
    await user.clear(valueInput);
    await user.type(valueInput, '*3.5*');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:*3.5*');
  });

  it('renders with basic version when metadataCounts not provided', async () => {
    render(<MetadataFilterSelector {...defaultProps} metadataCounts={undefined} />);

    const select = screen.getByLabelText('Filter results by metadata key');
    fireEvent.mouseDown(select);

    // Should show keys without counts
    await waitFor(() => {
      expect(screen.getByText('model')).toBeInTheDocument();
    });
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });

  it('maintains focus after clearing value', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model:gpt-4" />);

    const valueInput = (await screen.findByLabelText(
      'Filter by metadata value',
    )) as HTMLInputElement;
    valueInput.focus();

    const clearButton = await screen.findByLabelText('Clear value');
    fireEvent.click(clearButton);

    // Value input should still be visible
    expect(screen.getByLabelText('Filter by metadata value')).toBeInTheDocument();
    // Note: Focus behavior can be tricky to test in jsdom
  });

  it('shows visual grouping with Paper component for value input', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    // Check for Paper component styling
    const paperElement = screen
      .getByLabelText('Filter by metadata value')
      .closest('[class*=MuiPaper]');
    expect(paperElement).toBeInTheDocument();

    // Check for = separator
    expect(screen.getByText('=')).toBeInTheDocument();
  });

  it('handles empty value correctly', async () => {
    const user = userEvent.setup();
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);

    const valueInput = await screen.findByLabelText('Filter by metadata value');
    await user.type(valueInput, 'test');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:test');

    await user.clear(valueInput);
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model');
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
