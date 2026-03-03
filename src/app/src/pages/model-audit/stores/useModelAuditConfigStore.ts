import { callApi } from '@app/utils/api';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  InstallationStatus,
  RecentScan,
  ScanOptions,
  ScanPath,
  ScanResult,
} from '../ModelAudit.types';

// Re-export types for convenience
export type { InstallationStatus, RecentScan };

interface ModelAuditConfigState {
  // Recent scans (persisted)
  recentScans: RecentScan[];

  // Current scan configuration
  paths: ScanPath[];
  scanOptions: ScanOptions;

  // Scan state
  isScanning: boolean;
  scanResults: ScanResult | null;
  error: string | null;

  // Installation status
  installationStatus: InstallationStatus;

  // UI state
  showFilesDialog: boolean;
  showOptionsDialog: boolean;

  // Actions - Recent scans
  addRecentScan: (paths: ScanPath[], label?: string) => void;
  removeRecentScan: (id: string) => void;
  removeRecentPath: (scanId: string, pathToRemove: string) => void;
  clearRecentScans: () => void;

  // Actions - Scan configuration
  setPaths: (paths: ScanPath[]) => void;
  addPath: (path: ScanPath) => void;
  removePath: (path: string) => void;
  setScanOptions: (options: ScanOptions) => void;

  // Actions - Scan state
  setIsScanning: (isScanning: boolean) => void;
  setScanResults: (results: ScanResult | null) => void;
  setError: (error: string | null) => void;
  clearScanState: () => void;

  // Actions - Installation status
  setInstallationStatus: (status: Partial<InstallationStatus>) => void;
  checkInstallation: () => Promise<{ installed: boolean; cwd: string }>;

  // Actions - UI state
  setShowFilesDialog: (show: boolean) => void;
  setShowOptionsDialog: (show: boolean) => void;

  // Computed
  getRecentScans: () => RecentScan[];
}

const MAX_RECENT_SCANS = 10;

// Singleton promise for request deduplication
let checkInstallationPromise: Promise<{ installed: boolean; cwd: string }> | null = null;

const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  blacklist: [],
  timeout: 3600,
};

export const useModelAuditConfigStore = create<ModelAuditConfigState>()(
  persist(
    (set, get) => ({
      // Initial state
      recentScans: [],
      paths: [],
      scanOptions: DEFAULT_SCAN_OPTIONS,
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

      // Actions - Recent scans
      addRecentScan: (paths, label) => {
        const newScan: RecentScan = {
          id: Date.now().toString(),
          paths,
          timestamp: Date.now(),
          label,
        };
        set((state) => ({
          recentScans: [newScan, ...state.recentScans].slice(0, MAX_RECENT_SCANS),
        }));
      },

      removeRecentScan: (id) => {
        set((state) => ({
          recentScans: state.recentScans.filter((scan) => scan.id !== id),
        }));
      },

      removeRecentPath: (scanId, pathToRemove) => {
        set((state) => ({
          recentScans: state.recentScans
            .map((scan) => {
              if (scan.id === scanId) {
                const updatedPaths = scan.paths.filter((p) => p.path !== pathToRemove);
                // If no paths left, remove the scan entirely
                if (updatedPaths.length === 0) {
                  return null;
                }
                return { ...scan, paths: updatedPaths };
              }
              return scan;
            })
            .filter(Boolean) as RecentScan[],
        }));
      },

      clearRecentScans: () => {
        set({ recentScans: [] });
      },

      // Actions - Scan configuration
      setPaths: (paths) => set({ paths }),

      addPath: (path) => {
        set((state) => ({ paths: [...state.paths, path] }));
      },

      removePath: (pathToRemove) => {
        set((state) => ({
          paths: state.paths.filter((p) => p.path !== pathToRemove),
        }));
      },

      setScanOptions: (options) => set({ scanOptions: options }),

      // Actions - Scan state
      setIsScanning: (isScanning) => set({ isScanning }),
      setScanResults: (scanResults) => set({ scanResults, error: null }),
      setError: (error) => set({ error }),
      clearScanState: () => set({ scanResults: null, error: null, isScanning: false }),

      // Actions - Installation status
      setInstallationStatus: (status) => {
        set((state) => ({
          installationStatus: { ...state.installationStatus, ...status },
        }));
      },

      checkInstallation: async () => {
        // If already checking, return existing promise
        if (checkInstallationPromise != null) {
          return checkInstallationPromise;
        }

        // Update status to checking
        set((state) => ({
          installationStatus: { ...state.installationStatus, checking: true },
        }));

        // Create deduplicated promise
        checkInstallationPromise = callApi('/model-audit/check-installed')
          .then(async (response) => {
            if (!response.ok) {
              throw new Error('Failed to check installation');
            }
            const data = await response.json();

            // Update installation status
            set({
              installationStatus: {
                checking: false,
                installed: data.installed,
                error: null,
                cwd: data.cwd || null,
              },
            });

            return { installed: data.installed, cwd: data.cwd || '' };
          })
          .catch((error) => {
            console.error('Error checking ModelAudit installation:', error);

            // Update with error
            set({
              installationStatus: {
                checking: false,
                installed: false,
                error: error.message,
                cwd: null,
              },
            });

            return { installed: false, cwd: '' };
          })
          .finally(() => {
            // Clear the promise after completion
            checkInstallationPromise = null;
          });

        return checkInstallationPromise;
      },

      // Actions - UI state
      setShowFilesDialog: (showFilesDialog) => set({ showFilesDialog }),
      setShowOptionsDialog: (showOptionsDialog) => set({ showOptionsDialog }),

      // Computed
      getRecentScans: () => get().recentScans,
    }),
    {
      name: 'model-audit-config-store',
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        // Only persist these fields
        recentScans: state.recentScans,
        scanOptions: state.scanOptions,
      }),
      storage: createJSONStorage(() => localStorage),
      // Migrate data from old store if it exists
      migrate: (persistedState, version) => {
        if (version === 0 || !persistedState) {
          // Check for old store data and migrate it
          const oldStoreKey = 'model-audit-store';
          const oldStoreData = localStorage.getItem(oldStoreKey);
          if (oldStoreData) {
            try {
              const parsed = JSON.parse(oldStoreData);
              const oldState = parsed.state || {};

              // Merge old data with persisted state
              const migratedState = {
                ...(persistedState || {}),
                recentScans: oldState.recentScans || [],
                scanOptions: oldState.scanOptions || DEFAULT_SCAN_OPTIONS,
              };

              // Clean up old store after successful migration
              localStorage.removeItem(oldStoreKey);
              console.info('[ModelAuditConfigStore] Migrated data from old store');

              return migratedState as typeof persistedState;
            } catch (e) {
              console.warn('[ModelAuditConfigStore] Failed to migrate from old store:', e);
            }
          }
        }
        return persistedState as typeof persistedState;
      },
    },
  ),
);
