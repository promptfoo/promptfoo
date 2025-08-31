import { callApi } from '@app/utils/api';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ScanOptions, ScanPath, ScanResult } from './ModelAudit.types';

interface RecentScan {
  id: string;
  paths: ScanPath[];
  timestamp: number;
  label?: string;
}

interface InstallationStatus {
  checking: boolean;
  installed: boolean | null;
  error: string | null;
  cwd: string | null;
}

// History-related types
interface HistoricalScan {
  id: string;
  createdAt: number;
  updatedAt: number;
  name?: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  results: ScanResult;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  metadata?: Record<string, any> | null;
}

interface ModelAuditState {
  // Recent scans
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

  // History state
  historicalScans: HistoricalScan[];
  isLoadingHistory: boolean;
  historyError: string | null;

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

  // Actions - Installation status
  setInstallationStatus: (status: Partial<InstallationStatus>) => void;
  checkInstallation: () => Promise<{ installed: boolean; cwd: string }>;

  // Actions - History
  fetchHistoricalScans: () => Promise<void>;
  deleteHistoricalScan: (id: string) => Promise<void>;
  viewHistoricalScan: (scan: HistoricalScan) => void;

  // Actions - UI state
  setActiveTab: (tab: number) => void;
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
  timeout: 300,
  verbose: false,
};

export const useModelAuditStore = create<ModelAuditState>()(
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
      historicalScans: [],
      isLoadingHistory: false,
      historyError: null,
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

      // Actions - Installation status
      setInstallationStatus: (status) => {
        set((state) => ({
          installationStatus: { ...state.installationStatus, ...status },
        }));
      },

      checkInstallation: async () => {
        // If already checking, return existing promise
        if (checkInstallationPromise) {
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

      // Actions - History
      // TODO(faizan): Implement pagination
      fetchHistoricalScans: async () => {
        set({ isLoadingHistory: true, historyError: null });

        try {
          const response = await callApi('/model-audit/scans');
          if (!response.ok) {
            throw new Error('Failed to fetch historical scans');
          }

          const data = await response.json();
          set({
            historicalScans: data.scans || [],
            isLoadingHistory: false,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch history';
          set({
            isLoadingHistory: false,
            historyError: errorMessage,
          });
        }
      },

      deleteHistoricalScan: async (id: string) => {
        try {
          const response = await callApi(`/model-audit/scans/${id}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            throw new Error('Failed to delete scan');
          }

          // Remove from local state
          set((state) => ({
            historicalScans: state.historicalScans.filter((scan) => scan.id !== id),
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete scan';
          set({ historyError: errorMessage });
          throw error;
        }
      },

      viewHistoricalScan: (scan: HistoricalScan) => {
        // Set the scan results and switch to Results tab
        set({
          scanResults: scan.results,
          activeTab: 1,
          paths:
            scan.metadata?.originalPaths?.map((p: string) => ({
              path: p,
              type: 'file' as const,
            })) || [],
        });
      },

      // Actions - UI state
      setActiveTab: (activeTab) => set({ activeTab }),
      setShowFilesDialog: (showFilesDialog) => set({ showFilesDialog }),
      setShowOptionsDialog: (showOptionsDialog) => set({ showOptionsDialog }),

      // Computed
      getRecentScans: () => get().recentScans,
    }),
    {
      name: 'model-audit-store',
      version: 2, // Increment version to handle migration
      skipHydration: true,
      partialize: (state) => ({
        // Only persist these fields - removed installationStatus
        recentScans: state.recentScans,
        scanOptions: state.scanOptions,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
