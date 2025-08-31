import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ColumnSelector } from './ColumnSelector';

describe('ColumnSelector', () => {
  const mockColumnData = [
    { value: 'col1', label: 'Column 1', group: 'Group A' },
    { value: 'col2', label: 'Column 2', group: 'Group A' },
    { value: 'Variable 1', label: 'Variable 1', group: 'Variables' },
    { value: 'col3', label: 'Column 3', group: 'Group B' },
  ];

  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('displays button with correct format showing selected/total count', () => {
    const selectedColumns = ['col1', 'col2'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    expect(button).toHaveTextContent('Columns (2/4)');
  });

  it('updates count when different columns are selected', () => {
    const selectedColumns = ['col1'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    expect(button).toHaveTextContent('Columns (1/4)');
  });

  it('shows 0/total when no columns are selected', () => {
    const selectedColumns: string[] = [];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    expect(button).toHaveTextContent('Columns (0/4)');
  });

  it('shows total/total when all columns are selected', () => {
    const selectedColumns = ['col1', 'col2', 'Variable 1', 'col3'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    expect(button).toHaveTextContent('Columns (4/4)');
  });

  it('handles empty columnData array', () => {
    const selectedColumns: string[] = [];

    render(
      <ColumnSelector columnData={[]} selectedColumns={selectedColumns} onChange={mockOnChange} />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    expect(button).toHaveTextContent('Columns (0/0)');
  });

  it('opens dialog when button is clicked', () => {
    const selectedColumns = ['col1'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    expect(screen.getByText('Select Columns')).toBeInTheDocument();
  });

  it('calls onChange when column is toggled', () => {
    const selectedColumns = ['col1'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    const checkboxes = screen.getAllByRole('checkbox');
    const column2Checkbox = checkboxes.find(
      (checkbox) =>
        checkbox.getAttribute('aria-labelledby')?.includes('Column 2') ||
        checkbox.closest('label')?.textContent?.includes('Column 2'),
    );

    if (column2Checkbox) {
      fireEvent.click(column2Checkbox);
    }

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: ['col1', 'col2'],
        }),
      }),
    );
  });

  it('shows all button works correctly', () => {
    const selectedColumns = ['col1'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    const showAllButton = screen.getByText('Show All');
    fireEvent.click(showAllButton);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: ['col1', 'col2', 'Variable 1', 'col3'],
        }),
      }),
    );
  });
});
