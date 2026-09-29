/// <reference types="@vitest/browser/matchers" />

import { DataTable } from '@app/components/data-table/data-table';
import { TooltipProvider } from '@app/components/ui/tooltip';
import ResultsCharts from '@app/pages/eval/components/ResultsCharts';
import { useTableStore } from '@app/pages/eval/components/store';
import { MediaFilters } from '@app/pages/media/components/MediaFilters';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { EvaluateTable } from '@promptfoo/types';
import '../../index.css';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('selects an evaluation with the keyboard and returns focus to the trigger', async () => {
  const onSelect = vi.fn();
  render(
    <MediaFilters
      typeFilter="all"
      onTypeFilterChange={vi.fn()}
      evalFilter=""
      onEvalFilterChange={onSelect}
      sort={{ field: 'createdAt', order: 'desc' }}
      onSortChange={vi.fn()}
      evals={[{ evalId: 'eval-one', description: 'First evaluation' }]}
      evalSearchQuery=""
      onEvalSearchQueryChange={vi.fn()}
      total={1}
    />,
  );
  const trigger = page.getByRole('button', { name: 'All Evaluations' });
  await trigger.click();
  await expect.element(page.getByRole('combobox', { name: 'Search evaluations' })).toHaveFocus();
  await userEvent.keyboard('{ArrowDown}');
  const search = page.getByRole('combobox', { name: 'Search evaluations' }).element();
  const active = search.getAttribute('aria-activedescendant');
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
    search.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, isComposing: true }),
    );
  }
  expect(search.getAttribute('aria-activedescendant')).toBe(active);
  expect(onSelect).not.toHaveBeenCalled();
  await userEvent.keyboard('{ArrowDown}{Enter}');
  expect(onSelect).toHaveBeenCalledWith('eval-one');
  await expect.element(trigger).toHaveFocus();
});

it('keeps logical row positions while a large table scrolls', async () => {
  const data = Array.from({ length: 1000 }, (_, index) => ({
    id: String(index),
    name: `Row ${index}`,
  }));
  const { container } = render(
    <TooltipProvider>
      <div style={{ height: 450, width: 800, display: 'flex' }}>
        <DataTable
          data={data}
          columns={[{ accessorKey: 'name', header: 'Name' }]}
          getRowId={(row) => row.id}
          rowDisplayMode="client-virtualized"
          maxHeight="400px"
        />
      </div>
    </TooltipProvider>,
  );
  const table = container.querySelector('table')!;
  await expect
    .poll(() => table.querySelectorAll('tbody tr[aria-rowindex]').length)
    .toBeGreaterThan(0);
  expect(table.getAttribute('aria-rowcount')).toBe('1001');
  expect(table.querySelectorAll('tbody tr[aria-rowindex]').length).toBeLessThan(1000);
  const scroller = table.parentElement!;
  scroller.scrollTop = 12000;
  await expect
    .poll(() =>
      Number(table.querySelector('tbody tr[aria-rowindex]')?.getAttribute('aria-rowindex')),
    )
    .toBeGreaterThan(100);
  expect(table.getAttribute('aria-rowcount')).toBe('1001');
});

it('restores focus after closing the chart comparison dialog', async () => {
  useTableStore.setState({
    evalId: 'chart-fixture',
    config: {},
    table: {
      head: { prompts: [{ provider: 'fixture-one' }, { provider: 'fixture-two' }], vars: [] },
      body: [
        {
          outputs: [
            { score: 1, pass: true, text: 'one' },
            { score: 0.5, pass: true, text: 'two' },
          ],
          vars: [],
        },
      ],
    } as unknown as EvaluateTable,
  });
  render(<ResultsCharts scores={[1, 0.5]} />);
  const opener = page.getByRole('button', { name: 'Compare prompt outputs' });
  await opener.click();
  await expect.element(page.getByRole('dialog')).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await expect.element(opener).toHaveFocus();
});
