import { TooltipProvider } from '@app/components/ui/tooltip';
import { createMockResponse, mockCallApiResponse, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailureSummary } from './FailureSummary';
import FiltersForm from './ResultsFilters/FiltersForm';
import { useTableStore } from './store';

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));
const initialState = useTableStore.getState();
const summary = {
  failures: [
    { id: 'timeout-result', error: 'Request timed out', count: 2 },
    { id: 'manual-result', error: 'Manual failure', count: 1 },
  ],
  hasMore: false,
};
const onSelect = vi.fn(() => useTableStore.getState().setFilterMode('all'));
function component(evalId = 'eval-123') {
  return (
    <TooltipProvider>
      <FailureSummary key={evalId} evalId={evalId} onSelect={onSelect} />
      <FiltersForm />
    </TooltipProvider>
  );
}

describe('FailureSummary', () => {
  beforeEach(() => {
    act(() => useTableStore.setState(initialState));
    onSelect.mockClear();
    resetCallApiMock();
  });
  afterEach(() => {
    act(() => useTableStore.setState(initialState));
    vi.resetAllMocks();
  });

  it('selects one bounded group at a time, clears incompatible mode, and preserves other filters', async () => {
    act(() => {
      useTableStore.getState().setFilterMode('passes');
      useTableStore
        .getState()
        .addFilter({ type: 'metadata', field: 'topic', operator: 'equals', value: 'support' });
    });
    mockCallApiResponse(summary);
    render(component());
    await userEvent.click(
      await screen.findByRole('button', { name: '2 failures: Request timed out' }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
    expect(useTableStore.getState().filterMode).toBe('all');
    expect(Object.values(useTableStore.getState().filters.values)).toEqual([
      expect.objectContaining({ type: 'metadata', value: 'support' }),
      expect.objectContaining({
        type: 'error',
        value: 'timeout-result',
        label: 'Request timed out',
      }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: '1 failure: Manual failure' }));
    expect(
      Object.values(useTableStore.getState().filters.values).filter((f) => f.type === 'error'),
    ).toEqual([expect.objectContaining({ value: 'manual-result' })]);
    await userEvent.click(screen.getByRole('button', { name: '1 failure: Manual failure' }));
    expect(useTableStore.getState().filters.appliedCount).toBe(1);
  });

  it('does not expose text operators or transmit the failure description in table URLs', async () => {
    mockCallApiResponse(summary);
    render(component());
    await userEvent.click(
      await screen.findByRole('button', { name: '2 failures: Request timed out' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByRole('button', { name: 'Remove failure group' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    mockCallApiResponse({}, { status: 500 });
    await act(async () => {
      await useTableStore.getState().fetchEvalData('eval-123', {
        filters: Object.values(useTableStore.getState().filters.values),
      });
    });
    const url = String(
      vi.mocked(callApi).mock.calls[vi.mocked(callApi).mock.calls.length - 1]?.[0],
    );
    expect(decodeURIComponent(url)).toContain('timeout-result');
    expect(decodeURIComponent(url)).not.toContain('Request timed out');
  });

  it('refreshes for streamed table updates and reports a truncated summary', async () => {
    mockCallApiResponse(summary);
    render(component());
    await screen.findByRole('button', { name: '2 failures: Request timed out' });
    mockCallApiResponse({
      ...summary,
      hasMore: true,
      failures: [{ ...summary.failures[0], count: 3 }],
    });
    act(() => useTableStore.getState().setTable({ head: { prompts: [], vars: [] }, body: [] }));
    expect(
      await screen.findByRole('button', { name: '3 failures: Request timed out' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing the 100 most frequent failure groups.')).toBeInTheDocument();
  });

  it('clears old eval groups immediately and ignores late JSON responses', async () => {
    let finishOld!: (value: unknown) => void;
    const oldJson = new Promise((resolve) => {
      finishOld = resolve;
    });
    const oldResponse = createMockResponse({});
    oldResponse.json = vi.fn(() => oldJson);
    vi.mocked(callApi).mockResolvedValueOnce(oldResponse);
    const view = render(component());
    await waitFor(() => expect(oldResponse.json).toHaveBeenCalled());
    const oldSignal = vi.mocked(callApi).mock.calls[0][1]?.signal;
    mockCallApiResponse({ ...summary, failures: [summary.failures[1]] });
    view.rerender(component('eval-new'));
    expect(
      screen.queryByRole('button', { name: '2 failures: Request timed out' }),
    ).not.toBeInTheDocument();
    await screen.findByRole('button', { name: '1 failure: Manual failure' });
    await act(async () => finishOld(summary));
    expect(
      screen.queryByRole('button', { name: '2 failures: Request timed out' }),
    ).not.toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
  });

  it('hides groups when the summary request fails', async () => {
    vi.mocked(callApi).mockRejectedValueOnce(new Error('Unavailable'));
    render(component());
    await waitFor(() => expect(callApi).toHaveBeenCalledOnce());
    expect(screen.queryByRole('region', { name: 'Failure groups' })).not.toBeInTheDocument();
  });
});
