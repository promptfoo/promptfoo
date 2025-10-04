import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../test/queryClientWrapper';
import { callApi } from '../utils/api';
import useCloudConfig from './useCloudConfig';

vi.mock('../utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useCloudConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with isLoading=true, data=null, and error=null', () => {
    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ appUrl: 'https://app.promptfoo.com', isEnabled: true }),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCloudConfig(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set data and isLoading=false on successful API call', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockCloudConfig),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCloudConfig(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockCloudConfig);
    expect(result.current.error).toBeNull();
  });

  it('should set error and isLoading=false when API returns ok=false', async () => {
    (callApi as Mock).mockResolvedValue({
      ok: false,
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCloudConfig(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Failed to fetch cloud config');
  });

  it('should handle network errors gracefully', async () => {
    (callApi as Mock).mockRejectedValue(new Error('Network error'));

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCloudConfig(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
  });

  it('should handle malformed data gracefully', async () => {
    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ invalid: 'data' }),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCloudConfig(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Cloud config data is malformed');
  });

  it('should deduplicate requests when multiple hooks mount simultaneously', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockCloudConfig),
    });

    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createQueryClientWrapper(queryClient, children);

    // Render multiple hooks simultaneously
    const { result: result1 } = renderHook(() => useCloudConfig(), { wrapper });
    const { result: result2 } = renderHook(() => useCloudConfig(), { wrapper });
    const { result: result3 } = renderHook(() => useCloudConfig(), { wrapper });

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
      expect(result2.current.isLoading).toBe(false);
      expect(result3.current.isLoading).toBe(false);
    });

    // API should only be called once due to React Query deduplication
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result1.current.data).toEqual(mockCloudConfig);
    expect(result2.current.data).toEqual(mockCloudConfig);
    expect(result3.current.data).toEqual(mockCloudConfig);
  });

  it('should support refetch functionality', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockCloudConfig),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCloudConfig(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callApi).toHaveBeenCalledTimes(1);

    // Refetch should trigger another API call
    result.current.refetch();

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(2);
    });
  });
});
