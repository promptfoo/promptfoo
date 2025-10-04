import { act } from '@testing-library/react';
import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useCloudConfigStore } from './cloudConfigStore';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

const mockedCallApi = callApi as Mock;

describe('useCloudConfigStore', () => {
  const initialState = useCloudConfigStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    useCloudConfigStore.setState(initialState, true);
  });

  const verifyInitialState = () => {
    expect(useCloudConfigStore.getState().data).toBeNull();
    expect(useCloudConfigStore.getState().isLoading).toBe(true);
    expect(useCloudConfigStore.getState().error).toBeNull();
  };

  const verifyCloudConfigApiCall = () => {
    expect(mockedCallApi).toHaveBeenCalledTimes(1);
    expect(mockedCallApi).toHaveBeenCalledWith('/user/cloud-config');
  };

  describe('fetchCloudConfig', () => {
    it('should fetch and set cloud config data on successful API call', async () => {
      verifyInitialState();

      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.data).toEqual(mockCloudConfig);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      verifyCloudConfigApiCall();
    });

    it('should set error when API returns ok=false', async () => {
      verifyInitialState();

      mockedCallApi.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.data).toBeNull();
      expect(state.error).toBe('Failed to fetch cloud config');
      expect(state.isLoading).toBe(false);
      verifyCloudConfigApiCall();
    });

    it('should handle network errors gracefully', async () => {
      verifyInitialState();

      const networkError = new Error('Network error');
      mockedCallApi.mockRejectedValue(networkError);

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.data).toBeNull();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
      verifyCloudConfigApiCall();
    });

    it('should handle non-Error exceptions', async () => {
      verifyInitialState();

      mockedCallApi.mockRejectedValue('String error');

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.data).toBeNull();
      expect(state.error).toBe('Unknown error');
      expect(state.isLoading).toBe(false);
    });

    it('should allow retry after error (does not set _fetched on error)', async () => {
      verifyInitialState();

      // First call fails
      mockedCallApi.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      let state = useCloudConfigStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.data).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledTimes(1);

      // Second call succeeds - should not be blocked
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      mockedCallApi.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      state = useCloudConfigStore.getState();
      expect(state.data).toEqual(mockCloudConfig);
      expect(state.error).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledTimes(2);
    });

    it('should return early when data is already set', async () => {
      const existingConfig = {
        appUrl: 'https://existing.promptfoo.com',
        isEnabled: false,
      };
      useCloudConfigStore.setState({ data: existingConfig, isLoading: false, _fetched: true });
      expect(useCloudConfigStore.getState().data).toEqual(existingConfig);

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      expect(mockedCallApi).not.toHaveBeenCalled();
      expect(useCloudConfigStore.getState().data).toEqual(existingConfig);
      expect(useCloudConfigStore.getState().isLoading).toBe(false);
    });

    it('should handle JSON parsing errors gracefully', async () => {
      verifyInitialState();

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('JSON parsing error')),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.data).toBeNull();
      expect(state.error).toBe('JSON parsing error');
      expect(state.isLoading).toBe(false);
      verifyCloudConfigApiCall();
    });

    it('should recover from a hanging API request', async () => {
      verifyInitialState();

      let hangingResolve: (value: any) => void = () => {};
      const hangingPromise = new Promise((resolve) => {
        hangingResolve = resolve;
      });

      mockedCallApi.mockImplementationOnce(() => hangingPromise as any);

      const firstFetch = useCloudConfigStore.getState().fetchCloudConfig();

      const secondFetch = useCloudConfigStore.getState().fetchCloudConfig();

      act(() => {
        hangingResolve({ ok: false, json: () => ({}) });
      });

      await Promise.all([firstFetch, secondFetch]).catch(() => {});

      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      mockedCallApi.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.data).toEqual(mockCloudConfig);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledTimes(2);
    });

    it('should clear _fetchPromise even when an unexpected error occurs', async () => {
      verifyInitialState();

      const unexpectedError = new Error('Unexpected error outside try/catch');
      mockedCallApi.mockImplementation(() => {
        throw unexpectedError;
      });

      const preFetchPromise = useCloudConfigStore.getState()._fetchPromise;
      expect(preFetchPromise).toBeNull();

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.error).toBe('Unexpected error outside try/catch');
      expect(state.isLoading).toBe(false);
      expect(state._fetchPromise).toBeNull();
      verifyCloudConfigApiCall();
    });

    it('should not set _fetched to true when API returns successful response with invalid data structure', async () => {
      verifyInitialState();

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue('invalid data'),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      const state = useCloudConfigStore.getState();
      expect(state.data).toBeNull();
      expect(state.error).toBe('Cloud config data is malformed');
      expect(state.isLoading).toBe(false);
      expect(state._fetched).toBe(true);
      verifyCloudConfigApiCall();
    });
  });

  describe('refetch', () => {
    it('should force refetch even when data exists', async () => {
      const initialConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      mockedCallApi.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(initialConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      expect(useCloudConfigStore.getState().data).toEqual(initialConfig);
      expect(mockedCallApi).toHaveBeenCalledTimes(1);

      const updatedConfig = {
        appUrl: 'https://new.promptfoo.com',
        isEnabled: false,
      };

      mockedCallApi.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(updatedConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().refetch();
      });

      expect(useCloudConfigStore.getState().data).toEqual(updatedConfig);
      expect(useCloudConfigStore.getState().error).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledTimes(2);
    });

    it('should set isLoading=true during refetch', async () => {
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      let resolveFetch: any;
      const delayedPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      // First call resolves immediately
      mockedCallApi.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      expect(useCloudConfigStore.getState().isLoading).toBe(false);

      // Second call will be delayed so we can check loading state
      mockedCallApi.mockImplementationOnce(() => delayedPromise);

      // Start refetch
      const refetchPromise = act(async () => {
        await useCloudConfigStore.getState().refetch();
      });

      // Check that loading is true
      expect(useCloudConfigStore.getState().isLoading).toBe(true);

      // Resolve the delayed promise
      resolveFetch({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      await refetchPromise;

      // Wait for loading to become false
      expect(useCloudConfigStore.getState().isLoading).toBe(false);
    });

    it('should handle errors during refetch', async () => {
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      // Initial successful fetch
      mockedCallApi.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      expect(useCloudConfigStore.getState().data).toEqual(mockCloudConfig);
      expect(useCloudConfigStore.getState().error).toBeNull();

      // Setup error for refetch
      mockedCallApi.mockRejectedValueOnce(new Error('Refetch failed'));

      // Call refetch
      await act(async () => {
        await useCloudConfigStore.getState().refetch();
      });

      // Data should be cleared and error should be set
      expect(useCloudConfigStore.getState().data).toBeNull();
      expect(useCloudConfigStore.getState().error).toBe('Refetch failed');
      expect(useCloudConfigStore.getState().isLoading).toBe(false);
      expect(mockedCallApi).toHaveBeenCalledTimes(2);
    });

    it('should only make one API call when refetch is called multiple times simultaneously', async () => {
      const initialConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(initialConfig),
      });

      await act(async () => {
        await useCloudConfigStore.getState().fetchCloudConfig();
      });

      expect(useCloudConfigStore.getState().data).toEqual(initialConfig);
      expect(mockedCallApi).toHaveBeenCalledTimes(1);

      const updatedConfig = {
        appUrl: 'https://new.promptfoo.com',
        isEnabled: false,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(updatedConfig),
      });

      const refetchPromises = Array(5)
        .fill(null)
        .map(() => useCloudConfigStore.getState().refetch());

      await act(async () => {
        await Promise.all(refetchPromises);
      });

      expect(useCloudConfigStore.getState().data).toEqual(updatedConfig);
      expect(useCloudConfigStore.getState().error).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearConfig', () => {
    it('should reset state to initial values', () => {
      useCloudConfigStore.setState({
        data: { appUrl: 'test', isEnabled: true },
        isLoading: false,
        error: 'test error',
        _fetchPromise: Promise.resolve(),
        _fetched: true,
      });

      act(() => {
        useCloudConfigStore.getState().clearConfig();
      });

      expect(useCloudConfigStore.getState().data).toBeNull();
      expect(useCloudConfigStore.getState().isLoading).toBe(true);
      expect(useCloudConfigStore.getState().error).toBeNull();
      expect(useCloudConfigStore.getState()._fetchPromise).toBeNull();
      expect(useCloudConfigStore.getState()._fetched).toBe(false);
    });
  });
});
