import { useModelAuditUIStore } from './uiStore';
import { useInstallationCheck } from './useInstallationCheck';
import { useHistoricalScans } from './useHistoricalScans';
import { useDeleteScan } from './useDeleteScan';

/**
 * Compatibility bridge hook that provides the old ModelAuditStore API
 * using the new React Query + Zustand architecture internally.
 *
 * This allows existing components to continue working without changes
 * while benefiting from React Query's caching, deduplication, and loading states.
 *
 * @example
 * ```typescript
 * // Old way (still works):
 * const { installationStatus, checkInstallation, historicalScans, ... } = useModelAuditStore();
 *
 * // Now powered by React Query under the hood!
 * ```
 */
export function useModelAuditStoreCompat() {
  // Client state from UI store
  const uiStore = useModelAuditUIStore();

  // Server state from React Query
  const {
    data: installationData,
    isLoading: isCheckingInstallation,
    error: installationError,
    refetch: refetchInstallation,
  } = useInstallationCheck();

  const {
    data: historicalScans,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory,
  } = useHistoricalScans();

  const { deleteScan } = useDeleteScan();

  // Bridge the old API to new implementation
  return {
    // Client state (from UI store)
    recentScans: uiStore.recentScans,
    paths: uiStore.paths,
    scanOptions: uiStore.scanOptions,
    isScanning: uiStore.isScanning,
    scanResults: uiStore.scanResults,
    error: uiStore.error,
    activeTab: uiStore.activeTab,
    showFilesDialog: uiStore.showFilesDialog,
    showOptionsDialog: uiStore.showOptionsDialog,

    // Server state (from React Query)
    installationStatus: {
      checking: isCheckingInstallation,
      installed: installationData?.installed ?? null,
      error: installationError?.message ?? null,
      cwd: installationData?.cwd ?? null,
    },
    historicalScans: historicalScans,
    isLoadingHistory: isLoadingHistory,
    historyError: historyError?.message ?? null,

    // Client actions (from UI store)
    addRecentScan: uiStore.addRecentScan,
    removeRecentScan: uiStore.removeRecentScan,
    removeRecentPath: uiStore.removeRecentPath,
    clearRecentScans: uiStore.clearRecentScans,
    setPaths: uiStore.setPaths,
    addPath: uiStore.addPath,
    removePath: uiStore.removePath,
    setScanOptions: uiStore.setScanOptions,
    setIsScanning: uiStore.setIsScanning,
    setScanResults: uiStore.setScanResults,
    setError: uiStore.setError,
    setActiveTab: uiStore.setActiveTab,
    setShowFilesDialog: uiStore.setShowFilesDialog,
    setShowOptionsDialog: uiStore.setShowOptionsDialog,
    getRecentScans: uiStore.getRecentScans,

    // Server actions (bridged to React Query)
    checkInstallation: async () => {
      await refetchInstallation();
      return {
        installed: installationData?.installed ?? false,
        cwd: installationData?.cwd ?? '',
      };
    },
    setInstallationStatus: () => {
      console.warn(
        'setInstallationStatus is deprecated. Installation status is now managed by React Query.',
      );
    },
    fetchHistoricalScans: async () => {
      await refetchHistory();
    },
    deleteHistoricalScan: async (id: string) => {
      await deleteScan(id);
    },
    viewHistoricalScan: (scan: any) => {
      // Set the scan results and switch to Results tab
      uiStore.setScanResults(scan.results);
      uiStore.setActiveTab(1);
      uiStore.setPaths(
        scan.metadata?.originalPaths?.map((p: string) => ({
          path: p,
          type: 'file' as const,
        })) || [],
      );
    },
  };
}

// Attach persist object to the hook function to maintain compatibility
useModelAuditStoreCompat.persist = useModelAuditUIStore.persist;
