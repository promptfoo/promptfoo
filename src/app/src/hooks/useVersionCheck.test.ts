import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callApi } from '@app/utils/api';
import { createTestQueryClient, createQueryClientWrapper } from '../test/queryClientWrapper';
import { useVersionCheck } from './useVersionCheck';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useVersionCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should initialize with loading=true, error=null, dismissed=false, and versionInfo=null', () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useVersionCheck(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.dismissed).toBe(false);
    expect(result.current.versionInfo).toBeNull();
  });

  it('should set versionInfo, loading=false, and error=null on a successful API call', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm update',
        alternative: null,
      },
      commandType: 'npm' as const,
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockVersionInfo),
    } as unknown as Response);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useVersionCheck(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.versionInfo).toEqual(mockVersionInfo);
    expect(result.current.error).toBeNull();
  });

  it('should set error and loading=false when API call fails', async () => {
    // Mock a failed response (ok: false will trigger the error throw)
    vi.mocked(callApi).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useVersionCheck(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    // Wait for the query to finish (retry is disabled in test mode)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // After loading is false, we should have an error
    expect(result.current.error).not.toBeNull();
    expect(result.current.versionInfo).toBeNull();
  });

  it('should mark update as dismissed when dismiss() is called', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: false,
      isNpx: true,
      updateCommands: {
        primary: 'npx promptfoo@latest',
        alternative: null,
      },
      commandType: 'npx' as const,
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockVersionInfo),
    } as unknown as Response);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useVersionCheck(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.versionInfo).toEqual(mockVersionInfo);
    });

    expect(result.current.dismissed).toBe(false);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.dismissed).toBe(true);
    expect(localStorage.getItem('promptfoo:update:dismissedVersion')).toBe('1.1.0');
  });

  it('should initialize with dismissed=true if localStorage has the latest version', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: false,
      isNpx: false,
      updateCommands: {
        primary: 'npm update',
        alternative: null,
      },
      commandType: 'npm' as const,
    };

    localStorage.setItem('promptfoo:update:dismissedVersion', '1.1.0');

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockVersionInfo),
    } as unknown as Response);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useVersionCheck(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.versionInfo).toEqual(mockVersionInfo);
    });

    expect(result.current.dismissed).toBe(true);
  });
});
