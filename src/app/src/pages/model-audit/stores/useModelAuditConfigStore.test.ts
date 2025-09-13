import { act } from '@testing-library/react';
import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useModelAuditConfigStore } from './useModelAuditConfigStore';
import type { ScanPath, ScanOptions } from '../ModelAudit.types';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const mockedCallApi = callApi as Mock;

describe('useModelAuditConfigStore', () => {
  const initialState = useModelAuditConfigStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    useModelAuditConfigStore.setState(initialState, true);
    // Clear localStorage to avoid persistence effects
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should have correct initial state values', () => {
      const state = useModelAuditConfigStore.getState();
      expect(state.paths).toEqual([]);
      expect(state.scanOptions).toEqual({
        blacklist: [],
        timeout: 3600,
      });
      expect(state.isScanning).toBe(false);
      expect(state.scanResults).toBeNull();
      expect(state.error).toBeNull();
      expect(state.installationStatus).toEqual({
        installed: null,
        checking: false,
        error: null,
        cwd: null,
      });
      expect(state.showFilesDialog).toBe(false);
      expect(state.showOptionsDialog).toBe(false);
      expect(state.recentScans).toEqual([]);
    });
  });

  describe('paths management', () => {
    it('should add a path correctly', () => {
      const newPath: ScanPath = { path: '/test/path', type: 'file', name: 'test.py' };

      act(() => {
        useModelAuditConfigStore.getState().setPaths([newPath]);
      });

      expect(useModelAuditConfigStore.getState().paths).toEqual([newPath]);
    });

    it('should remove a path by path string', () => {
      const path1: ScanPath = { path: '/test/path1', type: 'file', name: 'test1.py' };
      const path2: ScanPath = { path: '/test/path2', type: 'file', name: 'test2.py' };

      act(() => {
        useModelAuditConfigStore.getState().setPaths([path1, path2]);
      });

      act(() => {
        useModelAuditConfigStore.getState().removePath('/test/path1');
      });

      expect(useModelAuditConfigStore.getState().paths).toEqual([path2]);
    });

    it('should not fail when removing non-existent path', () => {
      const path1: ScanPath = { path: '/test/path1', type: 'file', name: 'test1.py' };

      act(() => {
        useModelAuditConfigStore.getState().setPaths([path1]);
      });

      act(() => {
        useModelAuditConfigStore.getState().removePath('/nonexistent/path');
      });

      expect(useModelAuditConfigStore.getState().paths).toEqual([path1]);
    });
  });

  describe('scan options management', () => {
    it('should update scan options correctly', () => {
      const newOptions: ScanOptions = {
        blacklist: ['*.log', '*.tmp'],
        timeout: 7200,
        verbose: true,
      };

      act(() => {
        useModelAuditConfigStore.getState().setScanOptions(newOptions);
      });

      expect(useModelAuditConfigStore.getState().scanOptions).toEqual(newOptions);
    });
  });

  describe('scanning state', () => {
    it('should toggle scanning state correctly', () => {
      expect(useModelAuditConfigStore.getState().isScanning).toBe(false);

      act(() => {
        useModelAuditConfigStore.getState().setIsScanning(true);
      });

      expect(useModelAuditConfigStore.getState().isScanning).toBe(true);

      act(() => {
        useModelAuditConfigStore.getState().setIsScanning(false);
      });

      expect(useModelAuditConfigStore.getState().isScanning).toBe(false);
    });
  });

  describe('scan results', () => {
    it('should set scan results correctly', () => {
      const mockResults = {
        path: '/test/path',
        issues: [],
        success: true,
        scannedFiles: 10,
        totalFiles: 15,
        duration: 1000,
      };

      act(() => {
        useModelAuditConfigStore.getState().setScanResults(mockResults);
      });

      expect(useModelAuditConfigStore.getState().scanResults).toEqual(mockResults);
    });

    it('should clear scan results', () => {
      const mockResults = {
        path: '/test/path',
        issues: [],
        success: true,
      };

      act(() => {
        useModelAuditConfigStore.getState().setScanResults(mockResults);
      });

      act(() => {
        useModelAuditConfigStore.getState().setScanResults(null);
      });

      expect(useModelAuditConfigStore.getState().scanResults).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should set error message correctly', () => {
      const errorMessage = 'Test error message';

      act(() => {
        useModelAuditConfigStore.getState().setError(errorMessage);
      });

      expect(useModelAuditConfigStore.getState().error).toBe(errorMessage);
    });

    it('should clear error message', () => {
      act(() => {
        useModelAuditConfigStore.getState().setError('Test error');
      });

      act(() => {
        useModelAuditConfigStore.getState().setError(null);
      });

      expect(useModelAuditConfigStore.getState().error).toBeNull();
    });
  });

  describe('installation status checking', () => {
    it('should check installation status successfully', async () => {
      const mockResponse = {
        installed: true,
        cwd: '/current/working/dir',
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await act(async () => {
        await useModelAuditConfigStore.getState().checkInstallation();
      });

      const state = useModelAuditConfigStore.getState();
      expect(state.installationStatus.installed).toBe(true);
      expect(state.installationStatus.cwd).toBe('/current/working/dir');
      expect(state.installationStatus.checking).toBe(false);
      expect(state.installationStatus.error).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledWith('/model-audit/check-installed');
    });

    it('should handle installation check failure', async () => {
      const errorMessage = 'ModelAudit not installed';
      mockedCallApi.mockRejectedValue(new Error(errorMessage));

      await act(async () => {
        await useModelAuditConfigStore.getState().checkInstallation();
      });

      const state = useModelAuditConfigStore.getState();
      expect(state.installationStatus.installed).toBe(false);
      expect(state.installationStatus.checking).toBe(false);
      expect(state.installationStatus.error).toBe(errorMessage);
    });

    it('should handle API response error', async () => {
      mockedCallApi.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await act(async () => {
        await useModelAuditConfigStore.getState().checkInstallation();
      });

      const state = useModelAuditConfigStore.getState();
      expect(state.installationStatus.installed).toBe(false);
      expect(state.installationStatus.checking).toBe(false);
      expect(state.installationStatus.error).toBe('Failed to check installation');
    });

    it('should set checking state during installation check', () => {
      mockedCallApi.mockImplementation(() => new Promise(() => {})); // Never resolves

      act(() => {
        useModelAuditConfigStore.getState().checkInstallation();
      });

      expect(useModelAuditConfigStore.getState().installationStatus.checking).toBe(true);
    });
  });


  describe('dialog management', () => {
    it('should toggle files dialog visibility', () => {
      expect(useModelAuditConfigStore.getState().showFilesDialog).toBe(false);

      act(() => {
        useModelAuditConfigStore.getState().setShowFilesDialog(true);
      });

      expect(useModelAuditConfigStore.getState().showFilesDialog).toBe(true);

      act(() => {
        useModelAuditConfigStore.getState().setShowFilesDialog(false);
      });

      expect(useModelAuditConfigStore.getState().showFilesDialog).toBe(false);
    });

    it('should toggle options dialog visibility', () => {
      expect(useModelAuditConfigStore.getState().showOptionsDialog).toBe(false);

      act(() => {
        useModelAuditConfigStore.getState().setShowOptionsDialog(true);
      });

      expect(useModelAuditConfigStore.getState().showOptionsDialog).toBe(true);

      act(() => {
        useModelAuditConfigStore.getState().setShowOptionsDialog(false);
      });

      expect(useModelAuditConfigStore.getState().showOptionsDialog).toBe(false);
    });
  });

  describe('recent scans management', () => {
    it('should add recent scan correctly', () => {
      const paths: ScanPath[] = [
        { path: '/test/path1', type: 'file', name: 'test1.py' },
        { path: '/test/path2', type: 'file', name: 'test2.py' },
      ];

      act(() => {
        useModelAuditConfigStore.getState().addRecentScan(paths);
      });

      const state = useModelAuditConfigStore.getState();
      expect(state.recentScans).toHaveLength(1);
      expect(state.recentScans[0].paths).toEqual(paths);
      expect(state.recentScans[0].timestamp).toBeDefined();
    });

    it('should limit recent scans to maximum number', () => {
      const _path1: ScanPath[] = [{ path: '/test/path1', type: 'file', name: 'test1.py' }];
      const _path2: ScanPath[] = [{ path: '/test/path2', type: 'file', name: 'test2.py' }];

      // Add multiple scans to test limit
      for (let i = 0; i < 12; i++) {
        act(() => {
          useModelAuditConfigStore.getState().addRecentScan([
            { path: `/test/path${i}`, type: 'file', name: `test${i}.py` },
          ]);
        });
      }

      const state = useModelAuditConfigStore.getState();
      expect(state.recentScans.length).toBeLessThanOrEqual(10);
    });

    it('should add most recent scan to the beginning of the array', () => {
      const path1: ScanPath[] = [{ path: '/test/path1', type: 'file', name: 'test1.py' }];
      const path2: ScanPath[] = [{ path: '/test/path2', type: 'file', name: 'test2.py' }];

      act(() => {
        useModelAuditConfigStore.getState().addRecentScan(path1);
      });

      act(() => {
        useModelAuditConfigStore.getState().addRecentScan(path2);
      });

      const state = useModelAuditConfigStore.getState();
      expect(state.recentScans[0].paths).toEqual(path2);
      expect(state.recentScans[1].paths).toEqual(path1);
    });
  });

  describe('persistence', () => {
    it('should persist state to localStorage', () => {
      const testPaths: ScanPath[] = [{ path: '/test/persist', type: 'file', name: 'test.py' }];
      const testOptions: ScanOptions = {
        blacklist: ['*.log'],
        timeout: 7200,
        verbose: true,
      };

      act(() => {
        useModelAuditConfigStore.getState().setPaths(testPaths);
        useModelAuditConfigStore.getState().setScanOptions(testOptions);
      });

      // Simulate page reload by creating new store instance
      useModelAuditConfigStore.persist.rehydrate();

      const rehydratedState = useModelAuditConfigStore.getState();
      expect(rehydratedState.paths).toEqual(testPaths);
      expect(rehydratedState.scanOptions).toEqual(testOptions);
    });
  });
});