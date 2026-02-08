import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('should show toolbar when filter returns no results so users can clear filters', async () => {
    const user = userEvent.setup();
    const toolbarActions = <button data-testid="custom-action">Add Item</button>;

    const data: TestRow[] = [
      { id: '1', name: 'Apple' },
      { id: '2', name: 'Banana' },
    ];

    render(<DataTable columns={columns} data={data} showToolbar toolbarActions={toolbarActions} />);

    // Initially shows all data
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();

    // Type a search term that matches nothing
    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'xyz-no-match');

    // Data should be filtered out
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();

    // But toolbar should still be visible so user can clear/modify the filter
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
    expect(screen.getByText('No results match your search')).toBeInTheDocument();
  });

  describe('pagination', () => {
    // Generate test data with enough rows to require pagination
    const generateData = (count: number): TestRow[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `id-${i + 1}`,
        name: `Item ${i + 1}`,
      }));

    it('should show pagination controls when data exceeds page size', () => {
      const data = generateData(30);

      render(<DataTable columns={columns} data={data} initialPageSize={10} />);

      // Should show pagination controls
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
      expect(screen.getByText(/Showing 1 to 10 of 30 rows/)).toBeInTheDocument();
    });

    it('should navigate to next page when Next is clicked', async () => {
      const user = userEvent.setup();
      const data = generateData(15);

      render(<DataTable columns={columns} data={data} initialPageSize={10} />);

      // First page: items 1-10 visible
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 10')).toBeInTheDocument();
      expect(screen.queryByText('Item 11')).not.toBeInTheDocument();

      // Click Next
      await user.click(screen.getByRole('button', { name: 'Next' }));

      // Second page: items 11-15 visible, items 1-10 not visible
      expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Item 10')).not.toBeInTheDocument();
      expect(screen.getByText('Item 11')).toBeInTheDocument();
      expect(screen.getByText('Item 15')).toBeInTheDocument();
      expect(screen.getByText(/Showing 11 to 15 of 15 rows/)).toBeInTheDocument();
    });

    it('should navigate back when Previous is clicked', async () => {
      const user = userEvent.setup();
      const data = generateData(15);

      render(<DataTable columns={columns} data={data} initialPageSize={10} />);

      // Go to page 2
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('Item 11')).toBeInTheDocument();

      // Go back to page 1
      await user.click(screen.getByRole('button', { name: 'Previous' }));
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.queryByText('Item 11')).not.toBeInTheDocument();
    });

    it('should change page size when rows per page is changed', async () => {
      const user = userEvent.setup();
      const data = generateData(30);

      render(<DataTable columns={columns} data={data} initialPageSize={10} />);

      // Initially showing 10 rows
      expect(screen.getByText(/Showing 1 to 10 of 30 rows/)).toBeInTheDocument();

      // Change to 25 rows per page
      const pageSizeSelect = screen.getByRole('combobox');
      await user.click(pageSizeSelect);
      await user.click(screen.getByRole('option', { name: '25' }));

      // Now showing 25 rows
      expect(screen.getByText(/Showing 1 to 25 of 30 rows/)).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 25')).toBeInTheDocument();
    });

    it('should reset to first page when page size is changed', async () => {
      const user = userEvent.setup();
      const data = generateData(30);

      render(<DataTable columns={columns} data={data} initialPageSize={10} />);

      // Go to page 2
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText(/Showing 11 to 20 of 30 rows/)).toBeInTheDocument();
      expect(screen.getByText('Item 11')).toBeInTheDocument();

      // Change page size
      const pageSizeSelect = screen.getByRole('combobox');
      await user.click(pageSizeSelect);
      await user.click(screen.getByRole('option', { name: '25' }));

      // Should be back to first page showing items 1-25
      expect(screen.getByText(/Showing 1 to 25 of 30 rows/)).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 25')).toBeInTheDocument();
    });
  });

  describe('row selection', () => {
    it('should render separate checkboxes for identical data rows', () => {
      // All rows have identical data - this verifies each row gets a unique internal ID
      const identicalData: TestRow[] = [
        { id: 'same-id', name: 'Same Name' },
        { id: 'same-id', name: 'Same Name' },
        { id: 'same-id', name: 'Same Name' },
      ];

      render(<DataTable columns={columns} data={identicalData} enableRowSelection />);

      // Get all checkboxes (header + 3 rows)
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(4); // 1 header + 3 rows

      // Each row should be rendered separately (verifies unique row IDs)
      const table = screen.getByRole('table');
      const rows = table.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(3);
    });

    it('should select and deselect all rows correctly with identical data', async () => {
      const user = userEvent.setup();
      const identicalData: TestRow[] = [
        { id: 'same-id', name: 'Same Name' },
        { id: 'same-id', name: 'Same Name' },
        { id: 'same-id', name: 'Same Name' },
      ];

      render(<DataTable columns={columns} data={identicalData} enableRowSelection />);

      const checkboxes = screen.getAllByRole('checkbox');
      const selectAllCheckbox = checkboxes[0];

      // Select all
      await user.click(selectAllCheckbox);

      // All row checkboxes should be checked
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toBeChecked();
      expect(checkboxes[3]).toBeChecked();

      // Deselect all
      await user.click(selectAllCheckbox);

      // All row checkboxes should be unchecked
      expect(checkboxes[1]).not.toBeChecked();
      expect(checkboxes[2]).not.toBeChecked();
      expect(checkboxes[3]).not.toBeChecked();
    });

    it('should select individual rows independently with identical data', async () => {
      const user = userEvent.setup();
      const identicalData: TestRow[] = [
        { id: 'same-id', name: 'Same Name' },
        { id: 'same-id', name: 'Same Name' },
        { id: 'same-id', name: 'Same Name' },
      ];

      render(<DataTable columns={columns} data={identicalData} enableRowSelection />);

      const checkboxes = screen.getAllByRole('checkbox');

      // Select only the second row
      await user.click(checkboxes[2]);

      // Only the second row should be checked
      expect(checkboxes[1]).not.toBeChecked();
      expect(checkboxes[2]).toBeChecked();
      expect(checkboxes[3]).not.toBeChecked();

      // Select the first row too
      await user.click(checkboxes[1]);

      // First and second rows should be checked
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toBeChecked();
      expect(checkboxes[3]).not.toBeChecked();
    });

    it('should use custom getRowId without modification when provided', () => {
      const customGetRowId = (row: TestRow) => `custom-${row.id}`;
      const data: TestRow[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      const { container } = render(
        <DataTable columns={columns} data={data} enableRowSelection getRowId={customGetRowId} />,
      );

      const table = container.querySelector('table');
      const rows = table?.querySelectorAll('tbody tr');

      // Rows should exist and be rendered
      expect(rows).toHaveLength(2);
    });

    it('should return exact getRowId values in rowSelection state when rows are selected', async () => {
      const user = userEvent.setup();
      const customGetRowId = (row: TestRow) => `policy-${row.id}`;
      const data: TestRow[] = [
        { id: 'abc123', name: 'Policy 1' },
        { id: 'def456', name: 'Policy 2' },
      ];

      let capturedSelection: Record<string, boolean> = {};
      const handleSelectionChange = (selection: Record<string, boolean>) => {
        capturedSelection = selection;
      };

      render(
        <DataTable
          columns={columns}
          data={data}
          enableRowSelection
          getRowId={customGetRowId}
          rowSelection={{}}
          onRowSelectionChange={handleSelectionChange}
        />,
      );

      const checkboxes = screen.getAllByRole('checkbox');
      // checkboxes[0] is "select all", checkboxes[1] is first row, checkboxes[2] is second row

      // Select the first row
      await user.click(checkboxes[1]);

      // The selection state should use the exact ID from getRowId, NOT with index appended
      // This test catches the bug where getRowId was returning `policy-abc123-0` instead of `policy-abc123`
      expect(capturedSelection).toHaveProperty('policy-abc123', true);
      expect(capturedSelection).not.toHaveProperty('policy-abc123-0');

      // Select the second row
      await user.click(checkboxes[2]);

      expect(capturedSelection).toHaveProperty('policy-def456', true);
      expect(capturedSelection).not.toHaveProperty('policy-def456-1');
    });

    it('should use index-based row IDs when no getRowId is provided', () => {
      const data: TestRow[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      const { container } = render(<DataTable columns={columns} data={data} />);

      const table = container.querySelector('table');
      const rows = table?.querySelectorAll('tbody tr');

      // Rows should exist and be distinguishable
      expect(rows).toHaveLength(2);
    });

    it('should not apply text-ellipsis to select column cells', () => {
      const data: TestRow[] = [{ id: '1', name: 'Test Item' }];

      render(<DataTable columns={columns} data={data} enableRowSelection />);

      // Find the table body
      const table = screen.getByRole('table');
      const tbody = table.querySelector('tbody');
      const firstRow = tbody?.querySelector('tr');
      const cells = firstRow?.querySelectorAll('td');

      // First cell is the select column - should not have overflow-hidden or text-ellipsis
      const selectCell = cells?.[0];
      expect(selectCell?.className).not.toContain('overflow-hidden');
      expect(selectCell?.className).not.toContain('text-ellipsis');

      // Other cells should have overflow-hidden and text-ellipsis
      const dataCell = cells?.[1];
      expect(dataCell?.className).toContain('overflow-hidden');
      expect(dataCell?.className).toContain('text-ellipsis');
    });

    it('should apply cursor-pointer class only to select column', () => {
      const data: TestRow[] = [{ id: '1', name: 'Test Item' }];

      render(<DataTable columns={columns} data={data} enableRowSelection />);

      const table = screen.getByRole('table');
      const tbody = table.querySelector('tbody');
      const firstRow = tbody?.querySelector('tr');
      const cells = firstRow?.querySelectorAll('td');

      // First cell (select column) should have cursor-pointer
      const selectCell = cells?.[0];
      expect(selectCell?.className).toContain('cursor-pointer');

      // Data cells should not have cursor-pointer (unless onRowClick is provided)
      const dataCell = cells?.[1];
      expect(dataCell?.className).toContain('overflow-hidden');
    });
  });
});
