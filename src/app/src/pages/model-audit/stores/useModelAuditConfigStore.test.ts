import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useModelAuditConfigStore } from './useModelAuditConfigStore';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

describe('useModelAuditConfigStore', () => {
  const mockCallApi = vi.mocked(callApi);

  // Reset store before each test
  beforeEach(() => {
    act(() => {
      useModelAuditConfigStore.setState(useModelAuditConfigStore.getInitialState());
    });
  });

  it('should set paths', () => {
    const { result } = renderHook(() => useModelAuditConfigStore());
    const paths = [{ path: '/test', type: 'file' as const, name: 'test' }];

    act(() => {
      result.current.setPaths(paths);
    });

    expect(result.current.paths).toEqual(paths);
  });

  it('should add a path', () => {
    const { result } = renderHook(() => useModelAuditConfigStore());
    const path = { path: '/test', type: 'file' as const, name: 'test' };

    act(() => {
      result.current.addPath(path);
    });

    expect(result.current.paths).toEqual([path]);
  });

  it('should remove a path', () => {
    const { result } = renderHook(() => useModelAuditConfigStore());
    const path1 = { path: '/test1', type: 'file' as const, name: 'test1' };
    const path2 = { path: '/test2', type: 'file' as const, name: 'test2' };

    act(() => {
      result.current.setPaths([path1, path2]);
    });

    act(() => {
      result.current.removePath('/test1');
    });

    expect(result.current.paths).toEqual([path2]);
  });

  it('should handle checkInstallation success', async () => {
    const { result } = renderHook(() => useModelAuditConfigStore());
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ installed: true, cwd: '/test/cwd' }),
    } as Response);

    await act(async () => {
      await result.current.checkInstallation();
    });

    expect(result.current.installationStatus).toEqual({
      checking: false,
      installed: true,
      error: null,
      cwd: '/test/cwd',
    });
  });

  it('should handle checkInstallation failure', async () => {
    const { result } = renderHook(() => useModelAuditConfigStore());
    mockCallApi.mockRejectedValue(new Error('Installation check failed'));

    await act(async () => {
      await result.current.checkInstallation();
    });

    expect(result.current.installationStatus).toEqual({
      checking: false,
      installed: false,
      error: 'Installation check failed',
      cwd: null,
    });
  });

  it('should set scan options', () => {
    const { result } = renderHook(() => useModelAuditConfigStore());
    const options = { blacklist: [], timeout: 1000 };

    act(() => {
      result.current.setScanOptions(options);
    });

    expect(result.current.scanOptions).toEqual(options);
  });

  it('should set scanning state', () => {
    const { result } = renderHook(() => useModelAuditConfigStore());

    act(() => {
      result.current.setIsScanning(true);
    });

    expect(result.current.isScanning).toBe(true);
  });
});
