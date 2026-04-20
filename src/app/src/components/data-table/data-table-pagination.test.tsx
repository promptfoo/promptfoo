import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTablePagination } from './data-table-pagination';
import type { Table } from '@tanstack/react-table';

// Create a minimal mock table that satisfies the Table interface for pagination
function createMockTable(): Table<unknown> {
  return {
    setPageIndex: vi.fn(),
    previousPage: vi.fn(),
    nextPage: vi.fn(),
  } as unknown as Table<unknown>;
}

describe('DataTablePagination', () => {
  it('should call onPageSizeChange when page size is changed', async () => {
    const user = userEvent.setup();
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={0}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    // Find and click the page size select
    const pageSizeSelect = screen.getByRole('combobox');
    await user.click(pageSizeSelect);

    // Select a different page size
    await user.click(screen.getByRole('option', { name: '25' }));

    // Verify the callback was called with the new page size
    expect(onPageSizeChange).toHaveBeenCalledTimes(1);
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('should display correct row information', () => {
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={0}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    expect(screen.getByText(/Showing 1 to 10 of 50 rows/)).toBeInTheDocument();
  });

  it('should display correct row information on last page', () => {
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={4}
        pageSize={10}
        pageCount={5}
        totalRows={47}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    expect(screen.getByText(/Showing 41 to 47 of 47 rows/)).toBeInTheDocument();
  });

  it('should disable Previous/First buttons on first page', () => {
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={0}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last' })).not.toBeDisabled();
  });

  it('should disable Next/Last buttons on last page', () => {
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={4}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'First' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled();
  });

  it('should call table.previousPage when Previous button is clicked', async () => {
    const user = userEvent.setup();
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={2}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mockTable.previousPage).toHaveBeenCalledTimes(1);
  });

  it('should call table.nextPage when Next button is clicked', async () => {
    const user = userEvent.setup();
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={2}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockTable.nextPage).toHaveBeenCalledTimes(1);
  });

  it('should call table.setPageIndex(0) when First button is clicked', async () => {
    const user = userEvent.setup();
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={2}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(mockTable.setPageIndex).toHaveBeenCalledWith(0);
  });

  it('should call table.setPageIndex(pageCount - 1) when Last button is clicked', async () => {
    const user = userEvent.setup();
    const mockTable = createMockTable();
    const onPageSizeChange = vi.fn();

    render(
      <DataTablePagination
        table={mockTable}
        pageIndex={2}
        pageSize={10}
        pageCount={5}
        totalRows={50}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Last' }));
    expect(mockTable.setPageIndex).toHaveBeenCalledWith(4);
  });
});
