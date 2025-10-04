import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ScanOptions, ScanPath, ScanResult } from '../ModelAudit.types';

interface RecentScan {
  id: string;
  paths: ScanPath[];
  timestamp: number;
  label?: string;
}

interface ModelAuditUIState {
  // Recent scans (client-only, persisted)
  recentScans: RecentScan[];

  // Current scan configuration
  paths: ScanPath[];
  scanOptions: ScanOptions;

  // Scan state
  isScanning: boolean;
  scanResults: ScanResult | null;
  error: string | null;

  // UI state
  activeTab: number;
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

  // Actions - UI state
  setActiveTab: (tab: number) => void;
  setShowFilesDialog: (show: boolean) => void;
  setShowOptionsDialog: (show: boolean) => void;

  // Computed
  getRecentScans: () => RecentScan[];
}

const MAX_RECENT_SCANS = 10;

const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  blacklist: [],
  timeout: 3600,
};

/**
 * Client-only UI store for ModelAudit.
 *
 * This store contains ONLY client-side state and does NOT make API calls.
 * For server state (installation status, historical scans), use React Query hooks.
 *
 * State included:
 * - Recent scans (persisted to localStorage)
 * - Current scan configuration
 * - Scan state (isScanning, results, errors)
 * - UI state (active tab, dialogs)
 */
export const useModelAuditUIStore = create<ModelAuditUIState>()(
  persist(
    (set, get) => ({
      // Initial state
      recentScans: [],
      paths: [],
      scanOptions: DEFAULT_SCAN_OPTIONS,
      isScanning: false,
      scanResults: null,
      error: null,
      activeTab: 0,
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

      // Actions - UI state
      setActiveTab: (activeTab) => set({ activeTab }),
      setShowFilesDialog: (showFilesDialog) => set({ showFilesDialog }),
      setShowOptionsDialog: (showOptionsDialog) => set({ showOptionsDialog }),

      // Computed
      getRecentScans: () => get().recentScans,
    }),
    {
      name: 'model-audit-ui-store',
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        // Only persist these fields
        recentScans: state.recentScans,
        scanOptions: state.scanOptions,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
