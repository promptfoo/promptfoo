import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
    const { rerender } = render(
      <MetadataFilterSelector {...defaultProps} selectedMetadata="model" />,
    );
    
    await waitFor(() => {
      expect(screen.getByLabelText('Filter by metadata value')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter value (optional)')).toBeInTheDocument();
    });
  });

  it('calls onChange with key:value format when entering a value', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    
    const valueInput = await screen.findByLabelText('Filter by metadata value');
    await userEvent.type(valueInput, 'gpt-4');
    
    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:gpt-4');
    });
  });

  it('supports Enter key to apply filter', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    
    const valueInput = await screen.findByLabelText('Filter by metadata value');
    await userEvent.type(valueInput, 'gpt-4');
    fireEvent.keyPress(valueInput, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('model:gpt-4');
  });

  it('clears value but keeps key filter when clicking clear button', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model:gpt-4" />);
    
    const clearButton = await screen.findByLabelText('Clear value');
    fireEvent.click(clearButton);
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('model');
  });

  it('clears all filters when selecting "All metadata" option', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    
    const select = screen.getByLabelText('Filter results by metadata key');
    fireEvent.mouseDown(select);
    
    await waitFor(() => screen.getByText('All metadata'));
    fireEvent.click(screen.getByText('All metadata'));
    
    expect(defaultProps.onChange).toHaveBeenCalledWith(null);
  });

  it('displays tooltip with wildcard examples', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    
    const infoIcon = await screen.findByTestId('InfoOutlinedIcon');
    await userEvent.hover(infoIcon);
    
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
    rerender(
      <MetadataFilterSelector {...defaultProps} selectedMetadata="strategy:composite" />,
    );
    
    await waitFor(() => {
      expect(screen.getByLabelText('Filter by metadata value')).toHaveValue('composite');
    });
  });

  it('handles wildcard patterns correctly', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    
    const valueInput = await screen.findByLabelText('Filter by metadata value');
    
    // Test starts with pattern
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, 'gpt-*');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:gpt-*');
    
    // Test ends with pattern
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, '*-turbo');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:*-turbo');
    
    // Test contains pattern
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, '*3.5*');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:*3.5*');
  });

  it('renders with basic version when metadataCounts not provided', () => {
    render(<MetadataFilterSelector {...defaultProps} metadataCounts={undefined} />);
    
    const select = screen.getByLabelText('Filter results by metadata key');
    fireEvent.mouseDown(select);
    
    // Should show keys without counts
    expect(screen.getByText('model')).toBeInTheDocument();
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });

  it('maintains focus after clearing value', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model:gpt-4" />);
    
    const valueInput = await screen.findByLabelText('Filter by metadata value');
    valueInput.focus();
    
    const clearButton = await screen.findByLabelText('Clear value');
    fireEvent.click(clearButton);
    
    // Value input should still be visible and focused
    expect(screen.getByLabelText('Filter by metadata value')).toBeInTheDocument();
    expect(document.activeElement).toBe(valueInput);
  });

  it('shows visual grouping with Paper component for value input', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    
    // Check for Paper component styling
    const paperElement = screen.getByLabelText('Filter by metadata value').closest('[class*=MuiPaper]');
    expect(paperElement).toBeInTheDocument();
    
    // Check for = separator
    expect(screen.getByText('=')).toBeInTheDocument();
  });

  it('handles empty value correctly', async () => {
    render(<MetadataFilterSelector {...defaultProps} selectedMetadata="model" />);
    
    const valueInput = await screen.findByLabelText('Filter by metadata value');
    await userEvent.type(valueInput, 'test');
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model:test');
    
    await userEvent.clear(valueInput);
    expect(defaultProps.onChange).toHaveBeenLastCalledWith('model');
  });

  it('accessibility: has proper ARIA labels', () => {
    render(<MetadataFilterSelector {...defaultProps} />);
    
    expect(screen.getByLabelText('Filter results by metadata key')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter results by metadata key' })).toBeInTheDocument();
  });

  it('accessibility: announces changes to screen readers', async () => {
    render(<MetadataFilterSelector {...defaultProps} />);
    
    const description = screen.getByText(/Select a metadata key to filter evaluation results/);
    expect(description).toHaveAttribute('id', 'metadata-filter-description');
    expect(description).toHaveStyle({ position: 'absolute', left: '-9999px' });
  });
}); 