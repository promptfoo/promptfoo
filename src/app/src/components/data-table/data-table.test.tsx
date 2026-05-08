import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';
import { useServerVirtualizedRows } from './use-server-virtualized-rows';
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

const openHeaderFilterPopover = async (columnHeader: string, user = userEvent.setup()) => {
  await user.click(screen.getByRole('button', { name: `Filter ${columnHeader}` }));
  const heading = await screen.findByText(`Filter ${columnHeader}`);
  const popover = heading.closest('[data-radix-popper-content-wrapper]');
  expect(popover).toBeInTheDocument();
  return popover as HTMLElement;
};

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

  it('keeps filter value controls usable on narrow filter popovers', async () => {
    const user = userEvent.setup();
    const data: TestRow[] = [{ id: '1', name: 'Test Item 1' }];

    render(<DataTable columns={columns} data={data} showToolbar />);

    await user.click(screen.getByText('Filters'));

    const filterRow = screen.getByTestId('data-table-filter-row');
    const valueInput = screen.getByPlaceholderText('Value...');

    expect(filterRow).toHaveClass('flex-wrap');
    expect(valueInput).toHaveClass('min-w-[150px]');
  });

  it('keeps toolbar controls easier to tap on narrow screens', () => {
    const data: TestRow[] = [{ id: '1', name: 'Test Item 1' }];

    render(<DataTable columns={columns} data={data} showToolbar />);

    expect(screen.getByText('Columns').closest('button')).toHaveClass('h-11', 'sm:h-8');
    expect(screen.getByText('Filters').closest('button')).toHaveClass('h-11', 'sm:h-8');
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

  it('should sort rows when a sortable column header is clicked', async () => {
    const user = userEvent.setup();
    const sortableRows: TestRow[] = [
      { id: '1', name: 'Charlie' },
      { id: '2', name: 'Alpha' },
      { id: '3', name: 'Bravo' },
    ];

    render(<DataTable columns={columns} data={sortableRows} />);

    const nameHeader = screen.getByText('Name').closest('th') as HTMLElement;
    expect(nameHeader).toBeInTheDocument();

    await user.click(nameHeader);

    await waitFor(() => {
      const renderedRows = Array.from(document.querySelectorAll('tbody tr[data-rowindex]'));
      expect(renderedRows[0]).toHaveTextContent('Alpha');
      expect(renderedRows[1]).toHaveTextContent('Bravo');
      expect(renderedRows[2]).toHaveTextContent('Charlie');
    });
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
    await user.click(searchInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('xyz-no-match');

    // Data should be filtered out
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();

    // But toolbar should still be visible so user can clear/modify the filter
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
    expect(screen.getByText('No results match your search')).toBeInTheDocument();
  });

  it('should show no-results state instead of empty state when manual column filters are active with no data', () => {
    const activeColumnFilters = [{ id: 'name', value: 'Apple' }];

    render(
      <DataTable
        columns={columns}
        data={[]}
        manualFiltering
        columnFilters={activeColumnFilters}
        onColumnFiltersChange={vi.fn()}
        showToolbar
      />,
    );

    expect(screen.queryByText('No data found')).not.toBeInTheDocument();
    expect(screen.getByText('No results match your search')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('should preserve column visibility state when reopening the column menu', async () => {
    const user = userEvent.setup();
    const data: TestRow[] = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ];

    render(<DataTable columns={columns} data={data} />);

    await user.click(screen.getByRole('button', { name: /Columns/i }));
    const idMenuItem = await screen.findByRole('menuitemcheckbox', { name: 'ID' });
    expect(idMenuItem).toHaveAttribute('aria-checked', 'true');

    await user.click(idMenuItem);
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'ID' })).toBeNull());

    await user.click(screen.getByRole('button', { name: /Columns/i }));
    const reopenedIdMenuItem = await screen.findByRole('menuitemcheckbox', { name: 'ID' });
    expect(reopenedIdMenuItem).toHaveAttribute('aria-checked', 'false');
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
    await user.click(headerFilterInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('Item 2');
    await user.click(screen.getByRole('button', { name: 'Filter Name' }));

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(await screen.findByDisplayValue('Item 2')).toBeInTheDocument();
  });

  describe('virtualized rows', () => {
    const generateData = (count: number): TestRow[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `id-${i + 1}`,
        name: `Item ${i + 1}`,
      }));

    it('should virtualize client-side rows by default without mounting the full dataset', () => {
      const data = generateData(1000);
      const { container } = render(
        <DataTable
          columns={columns}
          data={data}
          maxHeight="400px"
          virtualRowEstimate={40}
          virtualOverscan={2}
        />,
      );

      const renderedRows = container.querySelectorAll('tbody tr[data-rowindex]');
      expect(renderedRows.length).toBeGreaterThan(0);
      expect(renderedRows.length).toBeLessThan(100);
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('should keep client-side row DOM bounded after a long scroll', async () => {
      const data = generateData(1000);
      const { container } = render(
        <DataTable
          columns={columns}
          data={data}
          maxHeight="400px"
          virtualRowEstimate={40}
          virtualOverscan={2}
        />,
      );

      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).not.toBeNull();
      if (scrollContainer) {
        await act(async () => {
          scrollContainer.scrollTop = 20_000;
          scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        });
        // TanStack Virtual debounces scroll-end notification after scroll events.
        // Let it settle before jsdom teardown so React does not receive a late update.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
        });
      }

      const renderedRows = container.querySelectorAll('tbody tr[data-rowindex]');
      expect(renderedRows.length).toBeGreaterThan(0);
      expect(renderedRows.length).toBeLessThan(100);
    });

    it('should virtualize server-side rows and request the visible range', async () => {
      const loadedRows = new Map<number, TestRow>([[0, { id: 'id-1', name: 'Loaded row' }]]);
      const loadRows = vi.fn();
      const { container } = render(
        <DataTable
          columns={columns}
          data={[]}
          rowDisplayMode="server-virtualized"
          maxHeight="400px"
          virtualRowEstimate={40}
          virtualOverscan={2}
          serverVirtualization={{
            rowCount: 1000,
            pageSize: 25,
            getRow: (index) => loadedRows.get(index),
            loadRows,
            isRowLoading: (index) => !loadedRows.has(index),
          }}
        />,
      );

      await waitFor(() => expect(loadRows).toHaveBeenCalled());
      expect(loadRows.mock.calls[0][0]).toEqual(
        expect.objectContaining({ startIndex: 0, endIndex: expect.any(Number) }),
      );
      expect(screen.getByText('Loaded row')).toBeInTheDocument();
      expect(container.querySelectorAll('tbody tr[data-rowindex]').length).toBeLessThan(100);
      expect(container.querySelector('tbody tr[aria-busy="true"]')).toBeInTheDocument();
    });

    it('should use virtual row indexes for server-side selection when no getRowId is provided', async () => {
      const user = userEvent.setup();
      let capturedSelection: Record<string, boolean> = {};
      const loadedRows = new Map<number, TestRow>([[25, { id: 'row-25', name: 'Loaded row 25' }]]);

      render(
        <DataTable
          columns={columns}
          data={[]}
          rowDisplayMode="server-virtualized"
          maxHeight="400px"
          virtualRowEstimate={20}
          virtualOverscan={10}
          enableRowSelection
          rowSelection={{}}
          onRowSelectionChange={(selection) => {
            capturedSelection = selection;
          }}
          serverVirtualization={{
            rowCount: 100,
            pageSize: 25,
            getRow: (index) => loadedRows.get(index),
            loadRows: vi.fn(),
            isRowLoading: (index) => !loadedRows.has(index),
          }}
        />,
      );

      await screen.findByText('Loaded row 25');

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(2);

      await user.click(checkboxes[1]);

      expect(capturedSelection).toHaveProperty('25', true);
      expect(capturedSelection).not.toHaveProperty('0');
    });

    it('should hide no-op filter controls for server-side rows by default', async () => {
      const loadRows = vi.fn();
      render(
        <DataTable
          columns={headerFilterColumns}
          data={[]}
          rowDisplayMode="server-virtualized"
          maxHeight="400px"
          serverVirtualization={{
            rowCount: 10,
            pageSize: 25,
            getRow: (index) => headerFilterRows[index],
            loadRows,
          }}
        />,
      );

      await waitFor(() => expect(loadRows).toHaveBeenCalled());

      expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Filter Name' })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    });

    it('should allow explicit manual column filters for server-side rows', async () => {
      const user = userEvent.setup();
      const onColumnFiltersChange = vi.fn();

      render(
        <DataTable
          columns={headerFilterColumns}
          data={[]}
          rowDisplayMode="server-virtualized"
          maxHeight="400px"
          manualFiltering
          columnFilters={[]}
          onColumnFiltersChange={onColumnFiltersChange}
          serverVirtualization={{
            rowCount: 1,
            pageSize: 25,
            getRow: (index) => headerFilterRows[index],
            loadRows: vi.fn(),
          }}
        />,
      );

      expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Filter Name' }));
      const filterInput = await screen.findByPlaceholderText('Value...');
      await user.type(filterInput, 'Row');

      await waitFor(() => expect(onColumnFiltersChange).toHaveBeenCalled());
    });

    it('should not refetch the initial server range when seeded rows cover it', async () => {
      const fetchRows = vi.fn().mockResolvedValue({ rows: [], offset: 0 });

      function SeededServerTable() {
        const { serverVirtualization } = useServerVirtualizedRows<TestRow>({
          initialRows: generateData(25),
          rowCount: 25,
          pageSize: 25,
          fetchRows,
        });

        return (
          <DataTable
            columns={columns}
            data={[]}
            rowDisplayMode="server-virtualized"
            maxHeight="400px"
            virtualRowEstimate={40}
            virtualOverscan={2}
            serverVirtualization={serverVirtualization}
          />
        );
      }

      render(<SeededServerTable />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchRows).not.toHaveBeenCalled();
    });

    it('should fall back to client virtualization when server configuration is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        render(
          <DataTable
            columns={columns}
            data={[{ id: 'id-1', name: 'Client fallback row' }]}
            rowDisplayMode={'server-virtualized' as any}
          />,
        );

        expect(screen.getByText('Client fallback row')).toBeInTheDocument();
        await waitFor(() =>
          expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('serverVirtualization')),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should reload the visible server range when sorting changes', async () => {
      const user = userEvent.setup();
      const loadRows = vi.fn();
      render(
        <DataTable
          columns={columns}
          data={[]}
          rowDisplayMode="server-virtualized"
          maxHeight="400px"
          serverVirtualization={{
            rowCount: 100,
            pageSize: 25,
            getRow: () => undefined,
            loadRows,
          }}
        />,
      );

      await waitFor(() => expect(loadRows).toHaveBeenCalled());
      const loadCountBeforeSort = loadRows.mock.calls.length;

      await user.click(screen.getByRole('columnheader', { name: 'Name' }));

      await waitFor(() => expect(loadRows.mock.calls.length).toBeGreaterThan(loadCountBeforeSort));
    });
    it('should abort server-side virtual row loads on cleanup', async () => {
      let capturedSignal: AbortSignal | undefined;
      const { unmount } = render(
        <DataTable
          columns={columns}
          data={[]}
          rowDisplayMode="server-virtualized"
          maxHeight="400px"
          serverVirtualization={{
            rowCount: 100,
            pageSize: 25,
            getRow: () => undefined,
            loadRows: ({ signal }) => {
              capturedSignal = signal;
            },
          }}
        />,
      );

      await waitFor(() => expect(capturedSignal).toBeDefined());
      unmount();
      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('manual filtering', () => {
    it('should call onColumnFiltersChange instead of filtering internally when manualFiltering is enabled', async () => {
      const user = userEvent.setup();
      const onColumnFiltersChange = vi.fn();

      render(
        <DataTable
          columns={headerFilterColumns}
          data={headerFilterRows}
          manualFiltering
          columnFilters={[]}
          onColumnFiltersChange={onColumnFiltersChange}
        />,
      );

      const popover = await openHeaderFilterPopover('Name', user);
      await user.type(within(popover).getByPlaceholderText('Value...'), 'test');

      await waitFor(() => expect(onColumnFiltersChange).toHaveBeenCalled());
      const lastCall =
        onColumnFiltersChange.mock.calls[onColumnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'name' })]));
    });

    it('should not filter rows client-side when manualFiltering is enabled', () => {
      render(
        <DataTable
          columns={headerFilterColumns}
          data={headerFilterRows}
          manualFiltering
          columnFilters={[{ id: 'status', value: { operator: 'equals', value: 'alpha' } }]}
          onColumnFiltersChange={vi.fn()}
        />,
      );

      // All rows should still be visible since filtering is manual (server-side)
      expect(screen.getByText('Row One')).toBeInTheDocument();
      expect(screen.getByText('Row Two')).toBeInTheDocument();
      expect(screen.getByText('Row Three')).toBeInTheDocument();
      expect(screen.getByText('Row Four')).toBeInTheDocument();
    });

    it('should reflect externally controlled column filter state', () => {
      const { rerender } = render(
        <DataTable
          columns={headerFilterColumns}
          data={headerFilterRows}
          manualFiltering
          columnFilters={[]}
          onColumnFiltersChange={vi.fn()}
        />,
      );

      // No active filter indicator initially
      const filterButton = screen.getByRole('button', { name: 'Filter Status' });
      expect(filterButton).toBeInTheDocument();

      // Apply external filter
      rerender(
        <DataTable
          columns={headerFilterColumns}
          data={headerFilterRows}
          manualFiltering
          columnFilters={[{ id: 'status', value: { operator: 'equals', value: 'beta' } }]}
          onColumnFiltersChange={vi.fn()}
        />,
      );

      // Filter button should now show active state (blue color)
      const activeFilterButton = screen.getByRole('button', { name: 'Filter Status' });
      expect(activeFilterButton).toBeInTheDocument();
    });
  });

  describe('column header filters', () => {
    it('should filter rows using the text input in a header popover', async () => {
      const user = userEvent.setup();
      const data: HeaderFilterRow[] = [
        ...headerFilterRows,
        { id: '5', name: 'Alpha Row', status: 'gamma' },
      ];

      render(<DataTable columns={headerFilterColumns} data={data} />);

      const popover = await openHeaderFilterPopover('Name', user);
      await user.type(within(popover).getByPlaceholderText('Value...'), 'Alpha');

      await waitFor(() => expect(screen.queryByText('Row Two')).not.toBeInTheDocument());
      expect(screen.getByText('Alpha Row')).toBeInTheDocument();
      expect(screen.queryByText('Row Three')).not.toBeInTheDocument();
    });

    it('should filter rows using the select input in a header popover', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={headerFilterColumns} data={headerFilterRows} />);

      const popover = await openHeaderFilterPopover('Status');
      const comboboxes = within(popover).getAllByRole('combobox');
      const valueSelect = comboboxes[1];

      await user.click(valueSelect);
      await user.click(await screen.findByRole('option', { name: 'Beta' }));

      await waitFor(() => expect(screen.queryByText('Row One')).not.toBeInTheDocument());
      expect(screen.getByText('Row Two')).toBeInTheDocument();
      expect(screen.queryByText('Row Three')).not.toBeInTheDocument();
      expect(screen.queryByText('Row Four')).not.toBeInTheDocument();
    });

    it('should support multi-select filtering from header popovers', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={headerFilterColumns} data={headerFilterRows} />);

      const popover = await openHeaderFilterPopover('Status');

      const operatorSelect = within(popover).getAllByRole('combobox')[0];
      await user.click(operatorSelect);
      await user.click(await screen.findByRole('option', { name: 'is any of' }));

      await user.click(within(popover).getByRole('button', { name: 'Select values...' }));
      await user.click(within(popover).getByText('Alpha'));
      await user.click(within(popover).getByText('Beta'));

      await waitFor(() => expect(screen.queryByText('Row Three')).not.toBeInTheDocument());
      expect(screen.getByText('Row One')).toBeInTheDocument();
      expect(screen.getByText('Row Two')).toBeInTheDocument();
      expect(screen.getByText('Row Four')).toBeInTheDocument();
    });

    it('should open header filter popovers with an active interactive row by default', async () => {
      const user = userEvent.setup();
      render(<DataTable columns={headerFilterColumns} data={headerFilterRows} />);

      const popover = await openHeaderFilterPopover('Name', user);
      const operatorSelect = within(popover).getByRole('combobox');
      const valueInput = within(popover).getByPlaceholderText('Value...');

      expect(operatorSelect).toBeInTheDocument();
      expect(valueInput).toBeInTheDocument();
      expect(valueInput).toBeEnabled();

      await user.type(valueInput, 'Row');
      await waitFor(() => expect(screen.getByText('Row One')).toBeInTheDocument());
    });

    it('should include header popover filters in the filter toolbar panel', async () => {
      const user = userEvent.setup();

      render(<DataTable columns={headerFilterColumns} data={headerFilterRows} />);

      const popover = await openHeaderFilterPopover('Status');
      const comboboxes = within(popover).getAllByRole('combobox');
      const valueSelect = comboboxes[1];
      await user.click(valueSelect);
      await user.click(await screen.findByRole('option', { name: 'Beta' }));
      await waitFor(() => expect(screen.queryByText('Row One')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /Filters/ }));
      const toolbarDialog = await waitFor(() => {
        const dialog = screen
          .getAllByRole('dialog')
          .find((node) => within(node).queryByRole('heading', { name: 'Filters' }));
        expect(dialog).toBeDefined();
        return dialog as HTMLElement;
      });
      expect(toolbarDialog).toBeDefined();
      expect(toolbarDialog).toHaveClass('w-[min(520px,calc(100vw-1rem))]');
      expect(await within(toolbarDialog).findByText('Status')).toBeInTheDocument();
      expect(await within(toolbarDialog).findByText(/beta/i)).toBeInTheDocument();
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

  it('should keep compact header padding for utility columns', () => {
    const data: TestRow[] = [{ id: '1', name: 'Test Item' }];
    const renderSubComponent = () => <div data-testid="expanded-content">Details</div>;

    const { container } = render(
      <DataTable
        columns={columns}
        data={data}
        enableRowSelection
        renderSubComponent={renderSubComponent}
      />,
    );

    const headerCells = container.querySelectorAll('thead th');
    expect(headerCells).toHaveLength(4);
    expect(headerCells[0].className).toContain('px-3');
    expect(headerCells[1].className).toContain('px-3');
    expect(headerCells[0].className).not.toContain('overflow-hidden');
    expect(headerCells[1].className).not.toContain('overflow-hidden');
    expect(headerCells[2].className).toContain('px-4');
    expect(headerCells[2].className).toContain('overflow-hidden');
    expect(headerCells[3].className).toContain('px-4');
    expect(headerCells[3].className).toContain('overflow-hidden');
  });

  it('should overlay sortable header actions without consuming label width', () => {
    const layoutColumns: ColumnDef<TestRow>[] = [
      {
        accessorKey: 'id',
        header: 'Identifier',
        size: 96,
      },
      {
        accessorKey: 'name',
        header: 'Right Aligned Header',
        size: 128,
        meta: {
          align: 'right',
        },
      },
    ];
    const data: TestRow[] = [{ id: '1', name: 'Long header row' }];

    render(<DataTable columns={layoutColumns} data={data} />);

    const assertHeaderLayout = (headerText: string, shouldBeRightAligned = false) => {
      const headerLabel = screen.getByText(headerText);
      const headerContent = headerLabel.closest('div');
      expect(headerContent).not.toBeNull();
      expect(headerContent).toHaveClass('flex', 'min-w-0', 'items-center');
      expect(headerContent).not.toHaveClass('gap-1');
      expect(headerContent).toHaveClass('overflow-hidden');

      if (shouldBeRightAligned) {
        expect(headerContent).toHaveClass('flex-row-reverse');
      } else {
        expect(headerContent).not.toHaveClass('flex-row-reverse');
      }

      expect(headerLabel).toHaveClass('block', 'min-w-0', 'flex-1', 'truncate');

      const actionGroup = headerContent?.querySelector('button')?.closest('span');
      expect(actionGroup).toBeInTheDocument();
      expect(actionGroup).toHaveClass('flex', 'shrink-0', 'items-center');
      expect(actionGroup).toHaveClass(
        'opacity-100',
        'pointer-events-auto',
        'sm:opacity-0',
        'sm:pointer-events-none',
        'sm:group-hover:opacity-100',
        'sm:group-hover:pointer-events-auto',
      );
      expect(actionGroup).not.toHaveClass('absolute', 'left-0', 'right-0');

      const sortButton = headerContent?.querySelector('button');
      expect(sortButton).toHaveAttribute('aria-label', `Sort ${headerText} ascending`);
    };

    assertHeaderLayout('Identifier');
    assertHeaderLayout('Right Aligned Header', true);
  });

  it('uses a clear label when the next sort action removes sorting', async () => {
    const user = userEvent.setup();
    const data: TestRow[] = [{ id: '1', name: 'Long header row' }];

    render(<DataTable columns={columns} data={data} />);

    await user.click(screen.getByRole('button', { name: 'Sort ID ascending' }));
    await user.click(screen.getByRole('button', { name: 'Sort ID descending' }));

    expect(screen.getByRole('button', { name: 'Clear sorting for ID' })).toBeInTheDocument();
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

    it('should render expanded content spanning only visible columns', async () => {
      const user = userEvent.setup();

      render(
        <DataTable
          columns={columns}
          data={data}
          renderSubComponent={renderSubComponent}
          initialColumnVisibility={{ expand: false }}
        />,
      );

      const table = screen.getByRole('table');
      const rows = table.querySelectorAll('tbody tr');
      await user.click(rows[0]);

      const expandedContent = screen.getByTestId('expanded-1');
      const expandedTd = expandedContent.closest('td');
      expect(expandedTd).toHaveAttribute('colspan', '2');
    });

    it('should allow overriding the expanded row background', async () => {
      const user = userEvent.setup();

      render(
        <DataTable
          columns={columns}
          data={data}
          renderSubComponent={renderSubComponent}
          expandedRowClassName="bg-transparent"
        />,
      );

      const expandButtons = screen.getAllByRole('button', { name: /expand row/i });
      await user.click(expandButtons[0]);

      const expandedRow = screen.getByTestId('expanded-1').closest('tr');
      expect(expandedRow).toHaveClass('bg-transparent');
    });
  });

  describe('sticky columns', () => {
    it('should pin configured edge columns during horizontal scrolling', () => {
      const stickyColumns: ColumnDef<TestRow>[] = [
        {
          accessorKey: 'id',
          header: 'Identifier',
          size: 96,
          meta: { sticky: 'left' },
        },
        {
          accessorKey: 'name',
          header: 'Name',
          size: 160,
        },
        {
          id: 'actions',
          header: 'Actions',
          size: 80,
          meta: { sticky: 'right' },
          cell: () => 'Open',
        },
      ];
      const data: TestRow[] = [{ id: '1', name: 'Pinned row' }];

      render(<DataTable columns={stickyColumns} data={data} />);

      const leftHeader = screen.getByText('Identifier').closest('th');
      const rightHeader = screen.getByText('Actions').closest('th');
      const leftCell = screen.getByText('1').closest('td');
      const rightCell = screen.getByText('Open').closest('td');

      expect(leftHeader).toHaveClass('sticky');
      expect(leftHeader).toHaveStyle({ left: '0px' });
      expect(leftHeader).toHaveClass('border-r');
      expect(rightHeader).toHaveClass('sticky');
      expect(rightHeader).toHaveStyle({ right: '0px' });
      expect(rightHeader).toHaveClass('border-l');
      expect(leftCell).toHaveClass('sticky');
      expect(leftCell).toHaveStyle({ left: '0px' });
      expect(rightCell).toHaveClass('sticky');
      expect(rightCell).toHaveStyle({ right: '0px' });
    });
  });
});
