import { renderHook, act } from '@testing-library/react';
import { callApi } from '@app/utils/api';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApiHealth } from './useApiHealth';

// Mock the API call
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('useApiHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with unknown status', () => {
    const { result } = renderHook(() => useApiHealth());
    expect(result.current.status).toBe('unknown');
    expect(result.current.message).toBeNull();
    expect(result.current.isChecking).toBe(false);
  });

  it('shows loading state while checking health', async () => {
    vi.mocked(callApi).mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useApiHealth());

    act(() => {
      result.current.checkHealth();
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.isChecking).toBe(true);
  });

  it('handles successful health check', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'OK', message: 'Cloud API is healthy' }),
    } as Response);

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.checkHealth();
    });

    expect(result.current.status).toBe('connected');
    expect(result.current.message).toBe('Cloud API is healthy');
    expect(result.current.isChecking).toBe(false);
  });

  it('handles failed health check', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ERROR', message: 'API is not accessible' }),
    } as Response);

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.checkHealth();
    });

    expect(result.current.status).toBe('blocked');
    expect(result.current.message).toBe('API is not accessible');
    expect(result.current.isChecking).toBe(false);
  });

  it('handles network errors', async () => {
    vi.mocked(callApi).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.checkHealth();
    });

    expect(result.current.status).toBe('blocked');
    expect(result.current.message).toBe('Network error: Unable to check API health');
    expect(result.current.isChecking).toBe(false);
  });

  it('handles disabled status from API', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'DISABLED', message: 'Remote generation is disabled' }),
    } as Response);

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.checkHealth();
    });

    expect(result.current.status).toBe('disabled');
    expect(result.current.message).toBe('Remote generation is disabled');
    expect(result.current.isChecking).toBe(false);
  });

  it('updates status when API response changes', async () => {
    // First call succeeds
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'OK', message: 'Cloud API is healthy' }),
    } as Response);

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.checkHealth();
    });

    expect(result.current.status).toBe('connected');

    // Second call fails
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ERROR', message: 'API is not accessible' }),
    } as Response);

    await act(async () => {
      await result.current.checkHealth();
    });

    expect(result.current.status).toBe('blocked');
  });
});
