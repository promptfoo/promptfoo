import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectChangeEvent } from '@mui/material/Select';

import { ColumnSelector } from './ColumnSelector';

describe('ColumnSelector', () => {
  const mockColumnData = [
    { value: 'col1', label: 'Column 1', group: 'Group A' },
    { value: 'col2', label: 'Column 2', group: 'Group A' },
    { value: 'Variable 1', label: 'Variable 1', group: 'Variables' },
    { value: 'Variable 2', label: 'Variable 2', group: 'Variables' },
    { value: 'col3', label: 'Column 3', group: 'Group B' },
  ];

  const mockOnChange = vi.fn<(event: SelectChangeEvent<string[]>) => void>();

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
    expect(button).toHaveTextContent('Columns (2/5)');
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
    expect(button).toHaveTextContent('Columns (1/5)');
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
    expect(button).toHaveTextContent('Columns (0/5)');
  });

  it('shows total/total when all columns are selected', () => {
    const selectedColumns = ['col1', 'col2', 'Variable 1', 'Variable 2', 'col3'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    expect(button).toHaveTextContent('Columns (5)');
  });

  it('groups columns with the same group value under the same header in the dialog', () => {
    const selectedColumns: string[] = [];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    const groupAHeader = screen.getByText('Group A');
    expect(groupAHeader).toBeInTheDocument();

    const column1InGroupA = screen.getByText('Column 1');
    expect(column1InGroupA).toBeInTheDocument();

    const column2InGroupA = screen.getByText('Column 2');
    expect(column2InGroupA).toBeInTheDocument();

    const groupBHeader = screen.getByText('Group B');
    expect(groupBHeader).toBeInTheDocument();

    const column3InGroupB = screen.getByText('Column 3');
    expect(column3InGroupB).toBeInTheDocument();
  });

  it('updates when columnData changes after initial render', () => {
    const selectedColumns = ['col1'];
    const initialColumnData = [
      { value: 'col1', label: 'Column 1' },
      { value: 'col2', label: 'Column 2' },
    ];

    const { rerender } = render(
      <ColumnSelector
        columnData={initialColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const updatedColumnData = [
      { value: 'col1', label: 'Column 1' },
      { value: 'col2', label: 'Column 2' },
      { value: 'col3', label: 'Column 3' },
    ];

    rerender(
      <ColumnSelector
        columnData={updatedColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    expect(button).toHaveTextContent('Columns (1/3)');
  });

  it('selects all variable columns and calls onChange when Variables button is clicked and not all variable columns are selected', () => {
    const selectedColumns = ['col1', 'Variable 1'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const columnsButton = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(columnsButton);

    const variablesButton = screen.getByRole('button', { name: /show all variable columns/i });
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: ['col1', 'Variable 1', 'Variable 2'],
        }),
      }),
    );
  });

  it('deselects all variable columns when Variables button is clicked and all variable columns are selected', () => {
    const selectedColumns = ['col1', 'col2', 'Variable 1', 'Variable 2', 'col3'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    const variablesButton = screen.getByLabelText('Hide all variable columns');
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: ['col1', 'col2', 'col3'],
        }),
      }),
    );
  });

  it('handles toggling multiple variable columns when the "Variables" button is clicked and variables are initially unselected', () => {
    const selectedColumns = ['col1', 'col2', 'col3'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    const variablesButton = screen.getByRole('button', {
      name: (content, element) => {
        return element?.getAttribute('aria-label')?.toLowerCase().includes('variable') || false;
      },
    });
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: ['col1', 'col2', 'col3', 'Variable 1', 'Variable 2'],
        }),
      }),
    );
  });

  it('handles toggling multiple variable columns when the "Variables" button is clicked and variables are initially selected', () => {
    const selectedColumns = ['col1', 'col2', 'col3', 'Variable 1', 'Variable 2'];

    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(button);

    const variablesButton = screen.getByRole('button', {
      name: (content, element) => {
        return element?.getAttribute('aria-label')?.toLowerCase().includes('variable') || false;
      },
    });
    fireEvent.click(variablesButton);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: ['col1', 'col2', 'col3'],
        }),
      }),
    );
  });
});
