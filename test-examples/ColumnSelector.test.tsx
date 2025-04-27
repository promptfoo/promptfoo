/* eslint-disable jest/require-top-level-describe */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ColumnSelector } from './ColumnSelector';

describe('ColumnSelector', () => {
  const mockColumnData = [
    { value: 'col1', label: 'Column 1', group: 'Group 1' },
    { value: 'col2', label: 'Column 2', group: 'Group 1' },
    { value: 'col3', label: 'Column 3', group: 'Group 2' },
  ];

  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders the button with correct column count', () => {
    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={['col1', 'col2']}
        onChange={mockOnChange}
      />,
    );

    expect(screen.getByText('Columns (2 / 3)')).toBeInTheDocument();
  });

  it('opens the dialog when button is clicked', () => {
    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByText('Columns (1 / 3)');
    fireEvent.click(button);

    expect(screen.getByText('Select Columns')).toBeInTheDocument();
  });

  it('toggles columns when clicked', () => {
    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByText('Columns (1 / 3)');
    fireEvent.click(button);

    // Toggle col1 (uncheck)
    const checkbox1 = screen.getByText('Column 1').closest('li')!.querySelector('input');
    fireEvent.click(checkbox1!);
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange.mock.calls[0][0].target.value).toEqual([]);

    // Toggle col2 (check)
    mockOnChange.mockClear();
    const checkbox2 = screen.getByText('Column 2').closest('li')!.querySelector('input');
    fireEvent.click(checkbox2!);
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange.mock.calls[0][0].target.value).toEqual(['col1', 'col2']);
  });

  it('selects all columns when Select All is clicked', () => {
    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByText('Columns (1 / 3)');
    fireEvent.click(button);

    const selectAllButton = screen.getByText('Select All');
    fireEvent.click(selectAllButton);

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange.mock.calls[0][0].target.value).toEqual(['col1', 'col2', 'col3']);
  });

  it('clears all selections when Clear is clicked', () => {
    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={['col1', 'col2']}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByText('Columns (2 / 3)');
    fireEvent.click(button);

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange.mock.calls[0][0].target.value).toEqual([]);
  });

  it('closes the dialog when Close button is clicked', () => {
    render(
      <ColumnSelector
        columnData={mockColumnData}
        selectedColumns={['col1']}
        onChange={mockOnChange}
      />,
    );

    const button = screen.getByText('Columns (1 / 3)');
    fireEvent.click(button);

    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);

    // Dialog should be closed
    expect(screen.queryByText('Select Columns')).not.toBeInTheDocument();
  });
});
