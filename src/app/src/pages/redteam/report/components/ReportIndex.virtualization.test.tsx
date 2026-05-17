import { mockCallApiResponse, resetCallApiMock } from '@app/tests/apiMocks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportIndex from './ReportIndex';
import type { EvalSummary } from '@promptfoo/types';

vi.mock('@app/utils/api');

const virtualizedReports: EvalSummary[] = Array.from({ length: 240 }, (_, index) => {
  const sequence = index + 1;

  return {
    evalId: `eval-${sequence}`,
    datasetId: `dataset-${sequence}`,
    description: `Report ${sequence}`,
    providers: [{ id: 'openai:gpt-4o-mini', label: 'GPT-4o mini' }],
    createdAt: Date.UTC(2024, 0, 1) + (240 - index) * 1000,
    passRate: 100,
    numTests: 12,
    attackSuccessRate: 0,
    label: `Report ${sequence}`,
    isRedteam: true,
  };
});

describe('ReportIndex virtualization layout', () => {
  beforeEach(() => {
    resetCallApiMock();
  });

  it('keeps the real reports table bounded while virtualizing large result sets', async () => {
    mockCallApiResponse({ data: virtualizedReports });

    const { container } = render(
      <MemoryRouter>
        <ReportIndex />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Report 1' })).toBeInTheDocument();

    expect(container.firstElementChild).toHaveClass(
      'flex',
      'flex-col',
      'overflow-hidden',
      'min-h-0',
    );

    const scrollContainer = container.querySelector(
      '.overflow-auto.overflow-x-auto.overflow-y-auto.overscroll-x-contain',
    );
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer).toHaveClass('flex-1', 'min-h-0');

    const tableFrame = scrollContainer?.parentElement;
    expect(tableFrame).toHaveClass('flex-1', 'min-h-0', 'flex', 'flex-col', 'overflow-hidden');

    const dataTableRoot = tableFrame?.parentElement;
    expect(dataTableRoot).toHaveClass('flex-1', 'min-h-0');

    const card = dataTableRoot?.parentElement;
    expect(card).toHaveClass('flex-1', 'min-h-0', 'flex', 'flex-col');

    const renderedRows = container.querySelectorAll('tbody tr[data-rowindex]');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(100);
    expect(renderedRows.length).toBeLessThan(virtualizedReports.length);
  });
});
