/// <reference types="@vitest/browser/matchers" />

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { Button } from '@app/components/ui/button';
import { Plus, Trash2, Upload } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { DataTable } from './data-table';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

import '@app/index.css';

const rows = [{ id: 'policy-1', name: 'Baseline policy' }];
const columns: ColumnDef<(typeof rows)[number]>[] = [{ accessorKey: 'name', header: 'Name' }];

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function PolicyTable() {
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [action, setAction] = useState('');
  const selectedCount = Object.values(selection).filter(Boolean).length;

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        enableRowSelection
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        getRowId={(row) => row.id}
        toolbarActions={
          <>
            <Button size="sm" onClick={() => setAction('Add Policy')}>
              <Plus className="mr-2 size-4" />
              Add Policy
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAction('Upload CSV')}>
              <Upload className="mr-2 size-4" />
              Upload CSV
            </Button>
            {selectedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setAction('Delete')}>
                <Trash2 className="mr-2 size-4" />
                Delete ({selectedCount})
              </Button>
            )}
          </>
        }
      />
      <output data-testid="action">{action}</output>
    </>
  );
}

function expectReachable(element: Element) {
  const bounds = container!.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
  expect(rect.right).toBeLessThanOrEqual(bounds.right);
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  expect(element.contains(hit)).toBe(true);
}

afterEach(async () => {
  flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  await page.viewport(1280, 720);
});

it.each([
  { width: 340, viewport: 1280 },
  { width: 596, viewport: 1280 },
  { width: 1100, viewport: 1280 },
  { width: 340, viewport: 390 },
])(
  'keeps toolbar actions reachable in a $width px table at $viewport px',
  async ({ width, viewport }) => {
    await page.viewport(viewport, 720);
    container = document.createElement('div');
    container.style.width = `${width}px`;
    document.body.append(container);
    root = createRoot(container);
    flushSync(() => root?.render(<PolicyTable />));

    const search = page.getByRole('searchbox', { name: 'Search table' });
    expectReachable(search.element());
    for (const name of ['Columns', 'Filters', 'Add Policy', 'Upload CSV']) {
      expectReachable(page.getByRole('button', { name, exact: true }).element());
    }

    await page.getByRole('button', { name: 'Upload CSV', exact: true }).click();
    await expect.element(page.getByTestId('action')).toHaveTextContent('Upload CSV');
    await page.getByRole('checkbox', { name: 'Select row', exact: true }).click();

    const remove = page.getByRole('button', { name: 'Delete (1)', exact: true });
    await expect.element(remove).toBeVisible();
    expectReachable(remove.element());
    expectReachable(search.element());
    await remove.click();
    await expect.element(page.getByTestId('action')).toHaveTextContent('Delete');

    await search.fill('missing policy');
    await expect.element(page.getByText('No results match your search')).toBeVisible();
    await search.clear();
    await expect.element(page.getByText('Baseline policy', { exact: true })).toBeVisible();
  },
);
