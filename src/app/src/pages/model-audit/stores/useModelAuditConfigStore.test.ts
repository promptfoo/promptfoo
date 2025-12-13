import { callApi } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditConfigStore } from './useModelAuditConfigStore';

vi.mock('@app/utils/api');

const mockCallApi = vi.mocked(callApi);

describe('useModelAuditConfigStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state between tests
    useModelAuditConfigStore.setState({
      recentScans: [],
      paths: [],
      scanOptions: { blacklist: [], timeout: 3600 },
      isScanning: false,
      scanResults: null,
      error: null,
      installationStatus: {
        checking: false,
        installed: null,
        error: null,
        cwd: null,
      },
      showFilesDialog: false,
      showOptionsDialog: false,
    });
  });

  describe('paths management', () => {
    it('should add a path', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.addPath({ path: '/test/model.bin', type: 'file', name: 'model.bin' });
      });

      expect(result.current.paths).toHaveLength(1);
      expect(result.current.paths[0].path).toBe('/test/model.bin');
    });

    it('should remove a path', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.addPath({ path: '/test/model1.bin', type: 'file', name: 'model1.bin' });
        result.current.addPath({ path: '/test/model2.bin', type: 'file', name: 'model2.bin' });
      });

      expect(result.current.paths).toHaveLength(2);

      act(() => {
        result.current.removePath('/test/model1.bin');
      });

      expect(result.current.paths).toHaveLength(1);
      expect(result.current.paths[0].path).toBe('/test/model2.bin');
    });

    it('should set paths', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());
      const newPaths = [
        { path: '/test/a.bin', type: 'file' as const, name: 'a.bin' },
        { path: '/test/b.bin', type: 'file' as const, name: 'b.bin' },
      ];

      act(() => {
        result.current.setPaths(newPaths);
      });

      expect(result.current.paths).toEqual(newPaths);
    });
  });

  describe('recent scans', () => {
    it('should add a recent scan', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());
      const paths = [{ path: '/test/model.bin', type: 'file' as const, name: 'model.bin' }];

      act(() => {
        result.current.addRecentScan(paths, 'Test Scan');
      });

      expect(result.current.recentScans).toHaveLength(1);
      expect(result.current.recentScans[0].paths).toEqual(paths);
      expect(result.current.recentScans[0].label).toBe('Test Scan');
    });

    it('should limit recent scans to 10', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        for (let i = 0; i < 15; i++) {
          result.current.addRecentScan(
            [{ path: `/test/model${i}.bin`, type: 'file' as const, name: `model${i}.bin` }],
            `Scan ${i}`,
          );
        }
      });

      expect(result.current.recentScans).toHaveLength(10);
      // Most recent should be first
      expect(result.current.recentScans[0].label).toBe('Scan 14');
    });

    it('should remove a recent scan', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.addRecentScan(
          [{ path: '/test/model.bin', type: 'file' as const, name: 'model.bin' }],
          'Test Scan',
        );
      });

      const scanId = result.current.recentScans[0].id;

      act(() => {
        result.current.removeRecentScan(scanId);
      });

      expect(result.current.recentScans).toHaveLength(0);
    });

    it('should remove a path from a recent scan', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.addRecentScan(
          [
            { path: '/test/model1.bin', type: 'file' as const, name: 'model1.bin' },
            { path: '/test/model2.bin', type: 'file' as const, name: 'model2.bin' },
          ],
          'Test Scan',
        );
      });

      const scanId = result.current.recentScans[0].id;

      act(() => {
        result.current.removeRecentPath(scanId, '/test/model1.bin');
      });

      expect(result.current.recentScans[0].paths).toHaveLength(1);
      expect(result.current.recentScans[0].paths[0].path).toBe('/test/model2.bin');
    });

    it('should remove entire scan when last path is removed', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.addRecentScan(
          [{ path: '/test/model.bin', type: 'file' as const, name: 'model.bin' }],
          'Test Scan',
        );
      });

      const scanId = result.current.recentScans[0].id;

      act(() => {
        result.current.removeRecentPath(scanId, '/test/model.bin');
      });

      expect(result.current.recentScans).toHaveLength(0);
    });

    it('should clear all recent scans', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.addRecentScan(
          [{ path: '/test/model1.bin', type: 'file' as const, name: 'model1.bin' }],
          'Scan 1',
        );
        result.current.addRecentScan(
          [{ path: '/test/model2.bin', type: 'file' as const, name: 'model2.bin' }],
          'Scan 2',
        );
      });

      expect(result.current.recentScans).toHaveLength(2);

      act(() => {
        result.current.clearRecentScans();
      });

      expect(result.current.recentScans).toHaveLength(0);
    });
  });

  describe('scan state', () => {
    it('should set scanning state', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.setIsScanning(true);
      });

      expect(result.current.isScanning).toBe(true);
    });

    it('should set scan results and clear error', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());
      const mockResults = {
        path: '/test',
        success: true,
        issues: [],
      };

      act(() => {
        result.current.setError('Some error');
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.setScanResults(mockResults as any);
      });

      expect(result.current.scanResults).toEqual(mockResults);
      expect(result.current.error).toBeNull();
    });

    it('should clear scan state', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.setIsScanning(true);
        result.current.setError('Some error');
        result.current.setScanResults({ path: '/test', success: true, issues: [] } as any);
      });

      act(() => {
        result.current.clearScanState();
      });

      expect(result.current.isScanning).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.scanResults).toBeNull();
    });
  });

  describe('installation check', () => {
    it('should check installation status', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ installed: true, cwd: '/test/dir' }),
      } as Response);

      const { result } = renderHook(() => useModelAuditConfigStore());

      await act(async () => {
        await result.current.checkInstallation();
      });

      await waitFor(() => {
        expect(result.current.installationStatus.installed).toBe(true);
        expect(result.current.installationStatus.cwd).toBe('/test/dir');
        expect(result.current.installationStatus.checking).toBe(false);
      });
    });

    it('should handle installation check failure', async () => {
      mockCallApi.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useModelAuditConfigStore());

      await act(async () => {
        await result.current.checkInstallation();
      });

      await waitFor(() => {
        expect(result.current.installationStatus.installed).toBe(false);
        expect(result.current.installationStatus.error).toBe('Network error');
        expect(result.current.installationStatus.checking).toBe(false);
      });
    });

    it('should deduplicate concurrent installation checks', async () => {
      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ installed: true, cwd: '/test/dir' }),
      } as Response);

      const { result } = renderHook(() => useModelAuditConfigStore());

      // Call multiple times concurrently
      await act(async () => {
        await Promise.all([
          result.current.checkInstallation(),
          result.current.checkInstallation(),
          result.current.checkInstallation(),
        ]);
      });

      // Should only have called the API once due to deduplication
      expect(mockCallApi).toHaveBeenCalledTimes(1);
    });
  });

  describe('UI state', () => {
    it('should toggle files dialog', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.setShowFilesDialog(true);
      });

      expect(result.current.showFilesDialog).toBe(true);

      act(() => {
        result.current.setShowFilesDialog(false);
      });

      expect(result.current.showFilesDialog).toBe(false);
    });

    it('should toggle options dialog', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());

      act(() => {
        result.current.setShowOptionsDialog(true);
      });

      expect(result.current.showOptionsDialog).toBe(true);
    });
  });

  describe('scan options', () => {
    it('should update scan options', () => {
      const { result } = renderHook(() => useModelAuditConfigStore());
      const newOptions = {
        blacklist: ['*.txt'],
        timeout: 7200,
        verbose: true,
      };

      act(() => {
        result.current.setScanOptions(newOptions);
      });

      expect(result.current.scanOptions).toEqual(newOptions);
    });
  });
});
