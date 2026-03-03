import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';
import type { ColumnDef } from '@tanstack/react-table';

interface TestRow {
  id: string;
  name: string;
}

interface HeaderFilterRow {
  id: string;
  name: string;
  status: string;
}

const headerFilterColumns: ColumnDef<HeaderFilterRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    meta: {
      filterVariant: 'select',
      filterOptions: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Beta', value: 'beta' },
        { label: 'Gamma', value: 'gamma' },
      ],
    },
  },
];

const headerFilterRows: HeaderFilterRow[] = [
  { id: '1', name: 'Row One', status: 'alpha' },
  { id: '2', name: 'Row Two', status: 'beta' },
  { id: '3', name: 'Row Three', status: 'gamma' },
  { id: '4', name: 'Row Four', status: 'alpha' },
];

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

  it('should rehydrate toolbar filter rows from active column filters when reopened', async () => {
    const user = userEvent.setup();
    const data: TestRow[] = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
      { id: '3', name: 'Item 3' },
    ];

    render(<DataTable columns={columns} data={data} />);

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(await screen.findByPlaceholderText('Value...')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    await user.click(screen.getByRole('button', { name: 'Filter Name' }));
    const headerFilterInput = await screen.findByPlaceholderText('Value...');
    await user.type(headerFilterInput, 'Item 2');
    await user.click(screen.getByRole('button', { name: 'Filter Name' }));

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(await screen.findByDisplayValue('Item 2')).toBeInTheDocument();
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

    it('should call external onPaginationChange when Next is clicked in manual pagination mode', async () => {
      const user = userEvent.setup();
      const data = generateData(10);
      const onPaginationChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(
        <DataTable
          columns={columns}
          data={data}
          manualPagination
          pageIndex={0}
          pageSize={10}
          pageCount={5}
          onPaginationChange={onPaginationChange}
          onPageSizeChange={onPageSizeChange}
          rowCount={50}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Next' }));

      expect(onPaginationChange).toHaveBeenCalledTimes(1);
      expect(onPaginationChange).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 10 });
    });

    it('should call external onPageSizeChange (not onPaginationChange) when page size changes in manual pagination mode', async () => {
      const user = userEvent.setup();
      const data = generateData(10);
      const onPaginationChange = vi.fn();
      const onPageSizeChange = vi.fn();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <DataTable
          columns={columns}
          data={data}
          manualPagination
          pageIndex={3}
          pageSize={10}
          pageCount={10}
          onPaginationChange={onPaginationChange}
          onPageSizeChange={onPageSizeChange}
          rowCount={100}
        />,
      );

      const pageSizeSelect = screen.getByRole('combobox');
      await user.click(pageSizeSelect);
      await user.click(screen.getByRole('option', { name: '25' }));

      expect(onPageSizeChange).toHaveBeenCalledTimes(1);
      expect(onPageSizeChange).toHaveBeenCalledWith(25);
      expect(onPaginationChange).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should support page-size changes through onPageSizeChange in a controlled manual-pagination wrapper', async () => {
      const user = userEvent.setup();
      const data = generateData(50);
      const totalRows = 50;
      const onPaginationChange = vi.fn();
      const onPageSizeChange = vi.fn();

      const ControlledPaginationWrapper = () => {
        const [pagination, setPagination] = React.useState({
          pageIndex: 2,
          pageSize: 5,
        });

        return (
          <DataTable
            columns={columns}
            data={data.slice(
              pagination.pageIndex * pagination.pageSize,
              (pagination.pageIndex + 1) * pagination.pageSize,
            )}
            manualPagination
            rowCount={totalRows}
            pageCount={Math.ceil(totalRows / pagination.pageSize)}
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            onPaginationChange={(nextPagination) => {
              onPaginationChange(nextPagination);
              setPagination(nextPagination);
            }}
            onPageSizeChange={(pageSize) => {
              onPageSizeChange(pageSize);
              setPagination((prev) => ({ ...prev, pageSize, pageIndex: 0 }));
            }}
          />
        );
      };

      render(<ControlledPaginationWrapper />);

      const pageSizeSelect = screen.getByRole('combobox');
      await user.click(pageSizeSelect);
      await user.click(screen.getByRole('option', { name: '25' }));

      expect(onPageSizeChange).toHaveBeenCalledTimes(1);
      expect(onPageSizeChange).toHaveBeenCalledWith(25);
      expect(onPaginationChange).not.toHaveBeenCalled();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 25')).toBeInTheDocument();
    });

    it('should use rowCount and avoid client-side row slicing in manual pagination mode', () => {
      const data = generateData(15);
      const onPaginationChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(
        <DataTable
          columns={columns}
          data={data}
          manualPagination
          pageIndex={0}
          pageSize={10}
          pageCount={8}
          onPaginationChange={onPaginationChange}
          onPageSizeChange={onPageSizeChange}
          rowCount={73}
        />,
      );

      // Manual pagination should render all provided rows for the current page payload.
      expect(screen.getByText('Item 15')).toBeInTheDocument();
      expect(screen.getByText(/Showing 1 to 10 of 73 rows/)).toBeInTheDocument();
    });

    it('should paginate and filter client-side when manual pagination is disabled', async () => {
      const user = userEvent.setup();
      const data: TestRow[] = Array.from({ length: 12 }, (_, i) => ({
        id: `${i + 1}`,
        name: i < 10 ? `Target-${i + 1}` : `Other-${i + 1}`,
      }));

      render(<DataTable columns={columns} data={data} initialPageSize={5} />);

      expect(screen.getByText(/Showing 1 to 5 of 12 rows/)).toBeInTheDocument();
      expect(screen.getByText('Target-5')).toBeInTheDocument();
      expect(screen.queryByText('Target-6')).not.toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText('Search...');
      await user.type(searchInput, 'Target');

      expect(screen.getByText(/Showing 1 to 5 of 10 rows/)).toBeInTheDocument();
      expect(screen.getByText('Target-5')).toBeInTheDocument();
      expect(screen.queryByText('Other-11')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText(/Showing 6 to 10 of 10 rows/)).toBeInTheDocument();
      expect(screen.getByText('Target-10')).toBeInTheDocument();
    });

    it('should delegate manual pagination to external state callbacks', async () => {
      const user = userEvent.setup();
      const data = generateData(20);
      const onPaginationChange = vi.fn();
      const onPageSizeChange = vi.fn();

      const ControlledPaginationWrapper = () => {
        const [pagination, setPagination] = React.useState({
          pageIndex: 0,
          pageSize: 5,
        });

        return (
          <DataTable
            columns={columns}
            data={data.slice(
              pagination.pageIndex * pagination.pageSize,
              (pagination.pageIndex + 1) * pagination.pageSize,
            )}
            manualPagination
            rowCount={20}
            pageCount={4}
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            onPaginationChange={(nextPagination) => {
              onPaginationChange(nextPagination);
              setPagination(nextPagination);
            }}
            onPageSizeChange={(pageSize) => {
              onPageSizeChange(pageSize);
              setPagination((prev) => ({ ...prev, pageSize, pageIndex: 0 }));
            }}
          />
        );
      };

      render(<ControlledPaginationWrapper />);

      await user.click(screen.getByRole('button', { name: 'Next' }));

      expect(onPaginationChange).toHaveBeenCalledTimes(1);
      expect(onPaginationChange).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 5 });
      expect(onPageSizeChange).not.toHaveBeenCalled();
      expect(screen.getByText('Item 6')).toBeInTheDocument();
      expect(screen.getByText(/Showing 6 to 10 of 20 rows/)).toBeInTheDocument();
    });
  });

  describe('column header filters', () => {
    it('should filter rows using the text input in a header popover', async () => {
      const user = userEvent.setup();
      const data: HeaderFilterRow[] = [
        ...headerFilterRows,
        { id: '5', name: 'Alpha Row', status: 'gamma' },
      ];

      render(<DataTable columns={headerFilterColumns} data={data} showPagination={false} />);

      await user.click(screen.getByRole('button', { name: 'Filter Name' }));
      await user.type(screen.getByPlaceholderText('Value...'), 'Alpha');

      expect(screen.getByText('Alpha Row')).toBeInTheDocument();
      expect(screen.queryByText('Row Two')).not.toBeInTheDocument();
      expect(screen.queryByText('Row Three')).not.toBeInTheDocument();
    });

    it('should filter rows using the select input in a header popover', async () => {
      const user = userEvent.setup();

      render(
        <DataTable columns={headerFilterColumns} data={headerFilterRows} showPagination={false} />,
      );

      await user.click(screen.getByRole('button', { name: 'Filter Status' }));
      const popover = screen.getByRole('dialog');
      const comboboxes = within(popover).getAllByRole('combobox');
      const valueSelect = comboboxes[1];

      await user.click(valueSelect);
      const option = screen.getByRole('option', { name: 'Beta', hidden: true });
      fireEvent.click(option);

      expect(screen.getByText('Row Two')).toBeInTheDocument();
      expect(screen.queryByText('Row One')).not.toBeInTheDocument();
      expect(screen.queryByText('Row Three')).not.toBeInTheDocument();
      expect(screen.queryByText('Row Four')).not.toBeInTheDocument();
    });

    it('should support multi-select filtering from header popovers', async () => {
      const user = userEvent.setup();

      render(
        <DataTable columns={headerFilterColumns} data={headerFilterRows} showPagination={false} />,
      );

      await user.click(screen.getByRole('button', { name: 'Filter Status' }));
      const popover = screen.getByRole('dialog');

      const operatorSelect = within(popover).getAllByRole('combobox')[0];
      await user.click(operatorSelect);
      const isAnyOption = await screen.findByRole('option', { name: /^is any of$/, hidden: true });
      await user.click(isAnyOption);

      const multiSelectButton = await within(popover).findByText('Select values...');
      await user.click(multiSelectButton);
      await user.click(within(popover).getByText('Alpha'));
      await user.click(within(popover).getByText('Beta'));

      expect(screen.getByText('Row One')).toBeInTheDocument();
      expect(screen.getByText('Row Two')).toBeInTheDocument();
      expect(screen.getByText('Row Four')).toBeInTheDocument();
      expect(screen.queryByText('Row Three')).not.toBeInTheDocument();
    });

    it('should open header filter popovers with an active interactive row by default', async () => {
      const user = userEvent.setup();

      render(
        <DataTable columns={headerFilterColumns} data={headerFilterRows} showPagination={false} />,
      );

      await user.click(screen.getByRole('button', { name: 'Filter Name' }));
      const operatorSelect = screen.getByRole('combobox');
      const valueInput = screen.getByPlaceholderText('Value...');

      expect(operatorSelect).toBeInTheDocument();
      expect(valueInput).toBeInTheDocument();
      expect(valueInput).toBeEnabled();

      await user.type(valueInput, 'Row');
      expect(screen.getByText('Row One')).toBeInTheDocument();
    });

    it('should include header popover filters in the filter toolbar panel', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={headerFilterColumns} data={headerFilterRows} />);

      await user.click(screen.getByRole('button', { name: 'Filter Status' }));
      const popover = screen.getByRole('dialog');
      const comboboxes = within(popover).getAllByRole('combobox');
      const valueSelect = comboboxes[1];
      await user.click(valueSelect);
      const betaOption = screen.getByRole('option', { name: 'Beta', hidden: true });
      fireEvent.click(betaOption);

      await user.click(screen.getByRole('button', { name: /Filters/ }));
      const toolbarDialog = screen
        .getAllByRole('dialog')
        .find((node) => within(node).queryByRole('heading', { name: 'Filters' }));
      expect(toolbarDialog).toBeDefined();
      expect(await within(toolbarDialog as HTMLElement).findByText('Status')).toBeInTheDocument();
      expect(await within(toolbarDialog as HTMLElement).findByText(/beta/i)).toBeInTheDocument();
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

  describe('cell content wrapper', () => {
    it('should wrap data cell content in a div with overflow-hidden but not select cells', () => {
      const data: TestRow[] = [{ id: '1', name: 'Test Item' }];

      render(<DataTable columns={columns} data={data} enableRowSelection />);

      const table = screen.getByRole('table');
      const tbody = table.querySelector('tbody');
      const firstRow = tbody?.querySelector('tr');
      const cells = firstRow?.querySelectorAll('td');

      // First cell is the select column - should NOT have the overflow wrapper
      const selectCell = cells?.[0];
      const selectWrapper = selectCell?.querySelector(':scope > div.overflow-hidden');
      expect(selectWrapper).toBeNull();

      // Data cells should have the overflow wrapper
      const dataCell = cells?.[1];
      const dataWrapper = dataCell?.querySelector(':scope > div.overflow-hidden');
      expect(dataWrapper).not.toBeNull();
      expect(dataWrapper?.className).toContain('min-w-0');
    });

    it('should render cell text content inside the overflow wrapper', () => {
      const data: TestRow[] = [
        { id: '1', name: 'A very long target name that would overflow a narrow column width' },
      ];

      render(<DataTable columns={columns} data={data} />);

      // Text should be in the document and accessible
      const textElement = screen.getByText(
        'A very long target name that would overflow a narrow column width',
      );
      expect(textElement).toBeInTheDocument();

      // The text should be inside a td > div.overflow-hidden chain
      const wrapper = textElement.closest('div.overflow-hidden');
      expect(wrapper).not.toBeNull();
      const td = wrapper?.closest('td');
      expect(td).not.toBeNull();
    });

    it('should allow click events to propagate through the wrapper to custom cell renderers', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      const columnsWithButton: ColumnDef<TestRow>[] = [
        {
          accessorKey: 'name',
          header: 'Name',
          cell: ({ getValue }) => (
            <button data-testid="cell-button" onClick={handleClick}>
              {getValue<string>()}
            </button>
          ),
        },
      ];

      const data: TestRow[] = [{ id: '1', name: 'Clickable Item' }];

      render(<DataTable columns={columnsWithButton} data={data} />);

      const button = screen.getByTestId('cell-button');
      expect(button).toBeInTheDocument();
      expect(button.textContent).toBe('Clickable Item');

      await user.click(button);
      expect(handleClick).toHaveBeenCalledOnce();
    });

    it('should not break row selection checkboxes', async () => {
      const user = userEvent.setup();
      const data: TestRow[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      render(<DataTable columns={columns} data={data} enableRowSelection />);

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3); // 1 header + 2 rows

      // Select individual row - should work through the wrapper
      await user.click(checkboxes[1]);
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).not.toBeChecked();
    });

    it('should keep long text within constrained column width with ellipsis', () => {
      const longNameData: TestRow[] = [
        {
          id: '1',
          name: 'This is an extremely long text value intended to test truncation behavior',
        },
      ];
      const longNameColumns: ColumnDef<TestRow>[] = [
        { accessorKey: 'id', header: 'ID', size: 100 },
        { accessorKey: 'name', header: 'Name', size: 120 },
      ];

      render(<DataTable columns={longNameColumns} data={longNameData} />);

      const table = screen.getByRole('table');
      const firstRow = table.querySelector('tbody tr');
      const nameCell = firstRow?.querySelectorAll('td')[1];

      expect(nameCell).not.toBeNull();
      expect(nameCell?.style.width).toBe('120px');
      expect(nameCell?.style.minWidth).toBe('120px');
      expect(nameCell?.style.maxWidth).toBe('120px');
      expect(nameCell?.className).toContain('overflow-hidden');
      expect(nameCell?.className).toContain('text-ellipsis');

      const textWrapper = screen
        .getByText('This is an extremely long text value intended to test truncation behavior')
        .closest('div');

      expect(textWrapper).not.toBeNull();
      expect(textWrapper?.className).toContain('overflow-hidden');
      expect(textWrapper?.className).toContain('min-w-0');
    });

    it('should preserve explicit Tailwind color utility classes in both themes', () => {
      const colorColumns: ColumnDef<TestRow>[] = [
        {
          accessorKey: 'name',
          header: 'Name',
          cell: ({ getValue }) => (
            <span
              data-testid="color-test-cell"
              className="text-emerald-700 dark:text-emerald-300 bg-amber-50 dark:bg-amber-950"
            >
              {getValue<string>()}
            </span>
          ),
        },
      ];
      const colorData: TestRow[] = [{ id: '1', name: 'Colorful row' }];

      render(
        <>
          <DataTable columns={colorColumns} data={colorData} />
          <div className="dark">
            <DataTable columns={colorColumns} data={colorData} />
          </div>
        </>,
      );

      const cells = screen.getAllByTestId('color-test-cell');
      expect(cells).toHaveLength(2);
      expect(cells[0]).toHaveClass('text-emerald-700');
      expect(cells[0]).toHaveClass('dark:text-emerald-300');
      expect(cells[0]).toHaveClass('bg-amber-50');
      expect(cells[0]).toHaveClass('dark:bg-amber-950');
      expect(cells[1]).toHaveClass('text-emerald-700');
      expect(cells[1]).toHaveClass('dark:text-emerald-300');
      expect(cells[1]).toHaveClass('bg-amber-50');
      expect(cells[1]).toHaveClass('dark:bg-amber-950');
    });
  });

  describe('row expansion', () => {
    const data: TestRow[] = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
      { id: '3', name: 'Item 3' },
    ];

    const renderSubComponent = (row: { original: TestRow }) => (
      <div data-testid={`expanded-${row.original.id}`}>Details for {row.original.name}</div>
    );

    it('should render expand chevron column when renderSubComponent is provided', () => {
      render(<DataTable columns={columns} data={data} renderSubComponent={renderSubComponent} />);

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });
      expect(expandButtons).toHaveLength(3);
    });

    it('should not render expand column when renderSubComponent is not provided', () => {
      render(<DataTable columns={columns} data={data} />);

      expect(screen.queryByRole('button', { name: /expand row/i })).not.toBeInTheDocument();
    });

    it('should expand a row when chevron is clicked', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={columns} data={data} renderSubComponent={renderSubComponent} />);

      expect(screen.queryByTestId('expanded-1')).not.toBeInTheDocument();

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });
      await user.click(expandButtons[0]);

      expect(screen.getByTestId('expanded-1')).toBeInTheDocument();
      expect(screen.getByText('Details for Item 1')).toBeInTheDocument();
    });

    it('should collapse a row when chevron is clicked again', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={columns} data={data} renderSubComponent={renderSubComponent} />);

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });

      await user.click(expandButtons[0]);
      expect(screen.getByTestId('expanded-1')).toBeInTheDocument();

      await user.click(expandButtons[0]);
      expect(screen.queryByTestId('expanded-1')).not.toBeInTheDocument();
    });

    it('should allow multiple rows expanded simultaneously by default', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={columns} data={data} renderSubComponent={renderSubComponent} />);

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });

      await user.click(expandButtons[0]);
      await user.click(expandButtons[1]);

      expect(screen.getByTestId('expanded-1')).toBeInTheDocument();
      expect(screen.getByTestId('expanded-2')).toBeInTheDocument();
    });

    it('should collapse other rows in singleExpand mode', async () => {
      const user = userEvent.setup();

      render(
        <DataTable
          columns={columns}
          data={data}
          renderSubComponent={renderSubComponent}
          singleExpand
        />,
      );

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });

      await user.click(expandButtons[0]);
      expect(screen.getByTestId('expanded-1')).toBeInTheDocument();

      await user.click(expandButtons[1]);
      expect(screen.queryByTestId('expanded-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('expanded-2')).toBeInTheDocument();
    });

    it('should respect getRowCanExpand predicate', () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          renderSubComponent={renderSubComponent}
          getRowCanExpand={(row) => row.original.id !== '2'}
        />,
      );

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });
      expect(expandButtons).toHaveLength(2);
    });

    it('should toggle expansion on row click when onRowClick is not provided', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={columns} data={data} renderSubComponent={renderSubComponent} />);

      const table = screen.getByRole('table');
      const rows = table.querySelectorAll('tbody tr');
      await user.click(rows[0]);

      expect(screen.getByTestId('expanded-1')).toBeInTheDocument();
    });

    it('should NOT toggle expansion on row click when onRowClick IS provided', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();

      render(
        <DataTable
          columns={columns}
          data={data}
          renderSubComponent={renderSubComponent}
          onRowClick={onRowClick}
        />,
      );

      const table = screen.getByRole('table');
      const rows = table.querySelectorAll('tbody tr');
      await user.click(rows[0]);

      expect(onRowClick).toHaveBeenCalledOnce();
      expect(screen.queryByTestId('expanded-1')).not.toBeInTheDocument();
    });

    it('should render expanded content spanning all columns', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={columns} data={data} renderSubComponent={renderSubComponent} />);

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });
      await user.click(expandButtons[0]);

      const expandedContent = screen.getByTestId('expanded-1');
      const expandedTd = expandedContent.closest('td');
      expect(expandedTd).toHaveAttribute('colspan', '3');
    });
  });
});
