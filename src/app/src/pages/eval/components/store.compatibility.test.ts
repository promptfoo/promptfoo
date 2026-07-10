import { mockBrowserProperty } from '@app/tests/browserMocks';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableStore } from './store';

const initialState = useTableStore.getState();

describe('useTableStore historical API compatibility', () => {
  beforeEach(() => {
    act(() => {
      useTableStore.setState(initialState, true);
    });
  });

  afterEach(() => {
    act(() => {
      useTableStore.setState(initialState, true);
    });
  });

  it('loads an oldest-shape eval table through the real response schema', async () => {
    const historicalResponse = {
      table: { head: { prompts: [], vars: [] }, body: [] },
      totalCount: 0,
      filteredCount: 0,
      config: {},
      author: null,
      version: 3,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(historicalResponse), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    mockBrowserProperty(globalThis, 'fetch', fetchMock as typeof fetch);

    let result;
    await act(async () => {
      result = await useTableStore.getState().fetchEvalData('historical-eval');
    });

    expect(result).toEqual({ ...historicalResponse, filteredMetrics: null });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useTableStore.getState()).toMatchObject({
      evalId: 'historical-eval',
      filteredMetrics: null,
      isFetching: false,
      stats: null,
      table: historicalResponse.table,
    });
  });
});
