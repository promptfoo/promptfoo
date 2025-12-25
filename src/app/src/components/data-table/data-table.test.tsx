import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';
import type { ColumnDef } from '@tanstack/react-table';

interface TestRow {
  id: string;
  name: string;
}

describe('DataTable', () => {
  const columns: ColumnDef<TestRow>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
    },
    {
      accessorKey: 'name',
      header: 'Name',
    },
  ];

  it('should render empty state with custom toolbar actions when data is empty and toolbarActions are provided', () => {
    const toolbarActions = <button data-testid="custom-action">Add Item</button>;

    render(
      <DataTable
        columns={columns}
        data={[]}
        showToolbar
        toolbarActions={toolbarActions}
        emptyMessage="No items found"
      />,
    );

    // Should show the custom toolbar action
    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
    expect(screen.getByText('Add Item')).toBeInTheDocument();

    // Should show the empty state message
    expect(screen.getByText('No data found')).toBeInTheDocument();
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('should not render toolbar in empty state when toolbarActions are not provided', () => {
    render(<DataTable columns={columns} data={[]} showToolbar emptyMessage="No items found" />);

    // Should show the empty state message
    expect(screen.getByText('No data found')).toBeInTheDocument();
    expect(screen.getByText('No items found')).toBeInTheDocument();

    // Should not render any toolbar
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('should render toolbar with data and custom actions', () => {
    const toolbarActions = <button data-testid="custom-action">Add Item</button>;

    const data: TestRow[] = [
      { id: '1', name: 'Test Item 1' },
      { id: '2', name: 'Test Item 2' },
    ];

    render(<DataTable columns={columns} data={data} showToolbar toolbarActions={toolbarActions} />);

    // Should show the custom toolbar action
    expect(screen.getByTestId('custom-action')).toBeInTheDocument();

    // Should show the data
    expect(screen.getByText('Test Item 1')).toBeInTheDocument();
    expect(screen.getByText('Test Item 2')).toBeInTheDocument();
  });

  it('should render table with data when data is provided', () => {
    const data: TestRow[] = [
      { id: '1', name: 'Test Item 1' },
      { id: '2', name: 'Test Item 2' },
      { id: '3', name: 'Test Item 3' },
    ];

    render(<DataTable columns={columns} data={data} />);

    // Should show all data rows
    expect(screen.getByText('Test Item 1')).toBeInTheDocument();
    expect(screen.getByText('Test Item 2')).toBeInTheDocument();
    expect(screen.getByText('Test Item 3')).toBeInTheDocument();

    // Should show column headers
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('should display loading state when isLoading is true', () => {
    render(<DataTable columns={columns} data={[]} isLoading />);

    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('should display error state when error is provided', () => {
    render(<DataTable columns={columns} data={[]} error="Failed to load data" />);

    expect(screen.getByText('Error loading data')).toBeInTheDocument();
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
  });

  it('should hide toolbar when showToolbar is false', () => {
    const data: TestRow[] = [{ id: '1', name: 'Test Item 1' }];

    render(<DataTable columns={columns} data={data} showToolbar={false} />);

    // Should show data but not toolbar
    expect(screen.getByText('Test Item 1')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
