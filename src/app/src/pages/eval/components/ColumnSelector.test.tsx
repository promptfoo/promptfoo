import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnSelector } from './ColumnSelector';

describe('ColumnSelector', () => {
  const mockOnChange = vi.fn();

  const sampleColumns = [
    { value: 'col1', label: 'Column 1', group: 'Group A', description: 'First column' },
    { value: 'col2', label: 'Column 2', group: 'Group A', description: 'Second column' },
    { value: 'col3', label: 'Column 3', group: 'Group B' },
    { value: 'Variable.foo', label: 'Variable: foo', group: 'Variables' },
    { value: 'Variable.bar', label: 'Variable: bar', group: 'Variables' },
    { value: 'col4', label: 'Column 4' }, // No group
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the button with column count', () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1', 'col2']}
        onChange={mockOnChange}
      />,
    );

    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument();
    expect(screen.getByText(/2\/6/)).toBeInTheDocument();
  });

  it('renders only selected count when all columns are selected', () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={sampleColumns.map((col) => col.value)}
        onChange={mockOnChange}
      />,
    );

    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument();
    // When all are selected, it should show "Columns (6)" without the "/6"
    const buttonText = screen.getByRole('button', { name: /columns/i }).textContent;
    expect(buttonText).toContain('6');
    expect(buttonText).not.toContain('/6');
  });

  it('opens dialog when button is clicked', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Select Columns')).toBeInTheDocument();
    });
  });

  it('displays columns grouped by their group property', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByText('Group A')).toBeInTheDocument();
      expect(screen.getByText('Group B')).toBeInTheDocument();
      expect(screen.getAllByText('Variables')).toHaveLength(2); // Button and group header
      expect(screen.getByText('Other')).toBeInTheDocument(); // For columns without a group
    });
  });

  it('shows correct checkbox states for selected columns', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1', 'col3']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      // col1 is selected
      expect(checkboxes[0]).toBeChecked();
      // col2 is not selected
      expect(checkboxes[1]).not.toBeChecked();
      // col3 is selected
      expect(checkboxes[2]).toBeChecked();
    });
  });

  it('toggles column selection when checkbox is clicked', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByText('Column 2')).toBeInTheDocument();
    });

    // Click on col2 to select it
    const col2Label = screen.getByText('Column 2');
    fireEvent.click(col2Label);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(['col1', 'col2']);
    });
  });

  it('deselects a column when clicking an already selected column', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1', 'col2']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByText('Column 1')).toBeInTheDocument();
    });

    // Click on col1 to deselect it
    const col1Label = screen.getByText('Column 1');
    fireEvent.click(col1Label);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(['col2']);
    });
  });

  it('shows "Show All" button and selects all columns when clicked', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show All' })).toBeInTheDocument();
    });

    const showAllButton = screen.getByRole('button', { name: 'Show All' });
    fireEvent.click(showAllButton);

    expect(mockOnChange).toHaveBeenCalledWith([
      'col1',
      'col2',
      'col3',
      'Variable.foo',
      'Variable.bar',
      'col4',
    ]);
  });

  it('shows Variables toggle button when variable columns exist', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /variables/i })).toBeInTheDocument();
    });
  });

  it('does not show Variables toggle when no variable columns exist', async () => {
    const nonVariableColumns = sampleColumns.filter((col) => !col.value.startsWith('Variable'));

    renderWithProviders(
      <ColumnSelector
        columnData={nonVariableColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByText('Select Columns')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /variables/i })).not.toBeInTheDocument();
  });

  it('toggles all variable columns when Variables button is clicked (show)', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      const variablesButton = screen.getByRole('button', { name: /variables/i });
      expect(variablesButton).toBeInTheDocument();
    });

    const variablesButton = screen.getByRole('button', { name: /variables/i });
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(['col1', 'Variable.foo', 'Variable.bar']);
  });

  it('toggles all variable columns when Variables button is clicked (hide)', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1', 'Variable.foo', 'Variable.bar']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      const variablesButton = screen.getByRole('button', { name: /variables/i });
      expect(variablesButton).toBeInTheDocument();
    });

    const variablesButton = screen.getByRole('button', { name: /variables/i });
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(['col1']);
  });

  it('closes dialog when Close button is clicked', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Get the footer Close button (not the X button)
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    const footerCloseButton = closeButtons.find((btn) => btn.textContent === 'Close');
    fireEvent.click(footerCloseButton!);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('handles empty column data gracefully', () => {
    renderWithProviders(
      <ColumnSelector columnData={[]} selectedColumns={[]} onChange={mockOnChange} />,
    );

    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument();
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it('groups columns without a group property into "Other"', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByText('Other')).toBeInTheDocument();
      expect(screen.getByText('Column 4')).toBeInTheDocument();
    });
  });

  it('handles variable columns that are partially selected', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1', 'Variable.foo']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      const variablesButton = screen.getByRole('button', { name: /variables/i });
      expect(variablesButton).toBeInTheDocument();
    });

    // When variables are partially selected, clicking should show all
    const variablesButton = screen.getByRole('button', { name: /variables/i });
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(['col1', 'Variable.foo', 'Variable.bar']);
  });

  it('preserves order when adding variables', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1', 'col2', 'Variable.foo']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /variables/i })).toBeInTheDocument();
    });

    // Click to add Variable.bar
    const variablesButton = screen.getByRole('button', { name: /variables/i });
    fireEvent.click(variablesButton);

    // Should add Variable.bar to the end
    expect(mockOnChange).toHaveBeenCalledWith(['col1', 'col2', 'Variable.foo', 'Variable.bar']);
  });

  it('maintains dialog state when toggling columns', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Toggle a column
    const col2Label = screen.getByText('Column 2');
    fireEvent.click(col2Label);

    // Dialog should still be open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('handles column data with no groups correctly', async () => {
    const ungroupedColumns = [
      { value: 'col1', label: 'Column 1' },
      { value: 'col2', label: 'Column 2' },
    ];

    renderWithProviders(
      <ColumnSelector
        columnData={ungroupedColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByText('Other')).toBeInTheDocument();
      expect(screen.getByText('Column 1')).toBeInTheDocument();
      expect(screen.getByText('Column 2')).toBeInTheDocument();
    });
  });

  it('displays all columns in their respective groups', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      // Group A
      expect(screen.getByText('Column 1')).toBeInTheDocument();
      expect(screen.getByText('Column 2')).toBeInTheDocument();
      // Group B
      expect(screen.getByText('Column 3')).toBeInTheDocument();
      // Variables
      expect(screen.getByText('Variable: foo')).toBeInTheDocument();
      expect(screen.getByText('Variable: bar')).toBeInTheDocument();
      // Other
      expect(screen.getByText('Column 4')).toBeInTheDocument();
    });
  });

  it('does not call onChange with duplicate values', async () => {
    renderWithProviders(
      <ColumnSelector
        columnData={sampleColumns}
        selectedColumns={['col1', 'Variable.foo', 'Variable.bar']}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /variables/i })).toBeInTheDocument();
    });

    // All variables are already selected, clicking Variables button should hide them
    const variablesButton = screen.getByRole('button', { name: /variables/i });
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(['col1']);
    // Verify no duplicates in the call
    const call = mockOnChange.mock.calls[0][0];
    expect(new Set(call).size).toBe(call.length);
  });
});
