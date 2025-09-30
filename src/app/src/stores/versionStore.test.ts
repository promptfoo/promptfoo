import { act } from '@testing-library/react';
import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useVersionStore } from './versionStore';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

const mockedCallApi = callApi as Mock;
const STORAGE_KEY = 'promptfoo:update:dismissedVersion';

describe('useVersionStore', () => {
  const initialState = useVersionStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useVersionStore.setState(initialState, true);
  });

  describe('fetchVersion', () => {
    it('should fetch and set version info on successful API call', async () => {
      const mockVersionInfo = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
        selfHosted: false,
        isNpx: false,
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm' as const,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockVersionInfo),
      } as unknown as Response);

      await act(async () => {
        await useVersionStore.getState().fetchVersion();
      });

      const state = useVersionStore.getState();
      expect(state.versionInfo).toEqual(mockVersionInfo);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.dismissed).toBe(false);
      expect(mockedCallApi).toHaveBeenCalledTimes(1);
      expect(mockedCallApi).toHaveBeenCalledWith('/version');
    });

    it('should set dismissed=true if version was previously dismissed', async () => {
      const mockVersionInfo = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
      };

      localStorage.setItem(STORAGE_KEY, '1.1.0');

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockVersionInfo),
      } as unknown as Response);

      await act(async () => {
        await useVersionStore.getState().fetchVersion();
      });

      const state = useVersionStore.getState();
      expect(state.dismissed).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('Network error');
      mockedCallApi.mockRejectedValue(error);

      await act(async () => {
        await useVersionStore.getState().fetchVersion();
      });

      const state = useVersionStore.getState();
      expect(state.versionInfo).toBeNull();
      expect(state.error).toEqual(error);
      expect(state.loading).toBe(false);
    });

    it('should handle non-ok responses', async () => {
      mockedCallApi.mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await act(async () => {
        await useVersionStore.getState().fetchVersion();
      });

      const state = useVersionStore.getState();
      expect(state.versionInfo).toBeNull();
      expect(state.error).toBeTruthy();
      expect(state.error?.message).toBe('Failed to fetch version information');
      expect(state.loading).toBe(false);
    });

    it('should return early when already fetched', async () => {
      useVersionStore.setState({ _fetched: true, loading: false });

      await act(async () => {
        await useVersionStore.getState().fetchVersion();
      });

      expect(mockedCallApi).not.toHaveBeenCalled();
    });

    it('should allow retry after error (does not set _fetched on error)', async () => {
      // First call fails
      mockedCallApi.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await useVersionStore.getState().fetchVersion();
      });

      let state = useVersionStore.getState();
      expect(state.error?.message).toBe('Network error');
      expect(state.versionInfo).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledTimes(1);

      // Second call succeeds - should not be blocked
      const mockVersionInfo = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
      };

      mockedCallApi.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockVersionInfo),
      } as unknown as Response);

      await act(async () => {
        await useVersionStore.getState().fetchVersion();
      });

      state = useVersionStore.getState();
      expect(state.versionInfo).toEqual(mockVersionInfo);
      expect(state.error).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate concurrent fetch calls', async () => {
      const mockVersionInfo = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockVersionInfo),
      } as unknown as Response);

      // Make multiple concurrent calls
      await act(async () => {
        await Promise.all([
          useVersionStore.getState().fetchVersion(),
          useVersionStore.getState().fetchVersion(),
          useVersionStore.getState().fetchVersion(),
        ]);
      });

      // API should only be called once
      expect(mockedCallApi).toHaveBeenCalledTimes(1);
      expect(useVersionStore.getState().versionInfo).toEqual(mockVersionInfo);
    });
  });

  describe('dismiss', () => {
    it('should store version in localStorage and set dismissed=true', async () => {
      const mockVersionInfo = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
      };

      // Set up version info
      useVersionStore.setState({ versionInfo: mockVersionInfo });

      act(() => {
        useVersionStore.getState().dismiss();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('1.1.0');
      expect(useVersionStore.getState().dismissed).toBe(true);
    });

    it('should not update localStorage if versionInfo is null', () => {
      useVersionStore.setState({ versionInfo: null });

      act(() => {
        useVersionStore.getState().dismiss();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(useVersionStore.getState().dismissed).toBe(false);
    });
  });
});
