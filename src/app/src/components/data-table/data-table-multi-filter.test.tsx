import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';
import type { ColumnDef } from '@tanstack/react-table';

const rows = [
  { type: 'XSS', severity: 'Critical', description: 'Cross-site script' },
  { type: 'SQL Injection', severity: 'Critical', description: 'SQL login' },
  { type: 'XSS', severity: 'High', description: 'Stored XSS' },
  { type: 'CSRF', severity: 'Medium', description: 'Missing token' },
  { type: 'SQL Injection', severity: 'High', description: 'SQL search' },
];
const columns: ColumnDef<(typeof rows)[number]>[] = [
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'severity', header: 'Severity' },
  { accessorKey: 'description', header: 'Description' },
];

function visibleDescriptions() {
  return Array.from(document.querySelectorAll('tbody tr')).map(
    (row) => row.lastElementChild?.textContent,
  );
}

async function setup() {
  const user = userEvent.setup();
  render(<DataTable columns={columns} data={rows} showToolbar />);
  await user.click(screen.getByRole('button', { name: 'Filters' }));
  await user.type(screen.getByRole('textbox', { name: 'Value for Type filter' }), 'SQL');
  await waitFor(() => expect(visibleDescriptions()).toEqual(['SQL login', 'SQL search']));
  return user;
}

async function changeColumn(user: ReturnType<typeof userEvent.setup>, index: number, name: string) {
  await user.click(screen.getByRole('combobox', { name: `Column for filter ${index}` }));
  await user.click(await screen.findByRole('option', { name }));
}

describe('DataTable toolbar filter integration', () => {
  it('combines filters and broadens results when one is removed', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await changeColumn(user, 2, 'Severity');
    await user.type(screen.getByRole('textbox', { name: 'Value for Severity filter' }), 'Critical');
    await waitFor(() => expect(visibleDescriptions()).toEqual(['SQL login']));

    await user.click(screen.getByRole('button', { name: 'Remove filter for Type' }));
    await waitFor(() => expect(visibleDescriptions()).toEqual(['Cross-site script', 'SQL login']));
    expect(screen.getByRole('textbox', { name: 'Value for Severity filter' })).toHaveValue(
      'Critical',
    );
  });

  it('preserves an existing filter when a new filter changes away from the same column', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await changeColumn(user, 2, 'Description');
    expect(screen.getByRole('textbox', { name: 'Value for Type filter' })).toHaveValue('SQL');
    await waitFor(() => expect(visibleDescriptions()).toEqual(['SQL login', 'SQL search']));
    await user.type(screen.getByRole('textbox', { name: 'Value for Description filter' }), 'login');
    await waitFor(() => expect(visibleDescriptions()).toEqual(['SQL login']));

    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await changeColumn(user, 3, 'Severity');
    await user.type(screen.getByRole('textbox', { name: 'Value for Severity filter' }), 'High');
    await waitFor(() =>
      expect(screen.getByText('No results match your search')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Remove filter for Description' }));
    await waitFor(() => expect(visibleDescriptions()).toEqual(['SQL search']));
  });

  it('preserves a column filter when removing a second empty filter on the same column', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    const filters = screen.getAllByTestId('data-table-filter-row');
    await user.click(within(filters[1]).getByRole('button', { name: 'Remove filter for Type' }));
    expect(screen.getByRole('textbox', { name: 'Value for Type filter' })).toHaveValue('SQL');
    await waitFor(() => expect(visibleDescriptions()).toEqual(['SQL login', 'SQL search']));
  });
});
