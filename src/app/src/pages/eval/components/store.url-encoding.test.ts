import { callApi } from '@app/utils/api';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableStore } from './store';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

const initialTableStoreState = useTableStore.getState();

describe('eval URL encoding', () => {
  beforeEach(() => {
    act(() => {
      useTableStore.setState(initialTableStoreState, true);
    });
    vi.clearAllMocks();
  });

  it('encodes reserved characters in downstream eval API paths', async () => {
    const evalId = 'imported/eval?#1';
    const mockedCallApi = vi.mocked(callApi);

    mockedCallApi
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [], vars: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
          config: {},
          version: 4,
          author: null,
          id: evalId,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [] }),
      } as Response);

    await act(async () => {
      await useTableStore.getState().fetchEvalData(evalId);
      await useTableStore.getState().fetchMetadataKeys(evalId);
      await useTableStore.getState().fetchMetadataValues(evalId, 'category');
    });

    expect(mockedCallApi.mock.calls[0][0]).toContain('/eval/imported%2Feval%3F%231/table');
    expect(mockedCallApi.mock.calls[1][0]).toBe('/eval/imported%2Feval%3F%231/metadata-keys');
    expect(mockedCallApi.mock.calls[2][0]).toBe(
      '/eval/imported%2Feval%3F%231/metadata-values?key=category',
    );
  });
});
